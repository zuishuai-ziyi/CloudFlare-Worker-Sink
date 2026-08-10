import type { H3Event } from 'h3'
import { asc, count, desc, eq, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { domains, links } from '../database/schema'

const DOMAIN_CACHE_KEY = 'domain:list'
const DOMAIN_CACHE_TTL = 60

export interface DomainState {
  domains: string[]
  default: string | null
}

export interface DomainListItem {
  name: string
  isDefault: boolean
  createdAt: number
  updatedAt: number
  linkCount: number
}

async function invalidateDomainCache(event: H3Event): Promise<void> {
  try {
    await event.context.cloudflare.env.KV.delete(DOMAIN_CACHE_KEY)
  }
  catch {
    // Best-effort invalidation; the short cache TTL bounds staleness regardless.
  }
}

export async function getDomains(event: H3Event): Promise<DomainState> {
  const env = event.context.cloudflare.env
  const cached = await env.KV.get<DomainState>(DOMAIN_CACHE_KEY, 'json')
  if (cached && Array.isArray(cached.domains))
    return cached

  const rows = await drizzle(env.DB).select().from(domains)
  const state: DomainState = {
    domains: rows.map(row => row.name),
    default: rows.find(row => row.isDefault)?.name ?? null,
  }
  try {
    await env.KV.put(DOMAIN_CACHE_KEY, JSON.stringify(state), { expirationTtl: DOMAIN_CACHE_TTL })
  }
  catch {
    // Cache writes are best-effort; D1 remains the source of truth.
  }
  return state
}

export async function getDefaultDomain(event: H3Event): Promise<string | null> {
  return (await getDomains(event)).default
}

export async function isDomainRegistered(event: H3Event, name: string): Promise<boolean> {
  const { domains } = await getDomains(event)
  return domains.includes(name)
}

export async function listDomains(event: H3Event): Promise<DomainListItem[]> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const rows = await db.select().from(domains).orderBy(desc(domains.isDefault), asc(domains.name))
  const counts = await db
    .select({ domain: links.domain, count: count() })
    .from(links)
    .groupBy(links.domain)
  const countMap = new Map(counts.map(item => [item.domain, item.count]))
  const countFor = (name: string) => countMap.get(name) ?? 0
  const defaultName = rows.find(row => row.isDefault)?.name ?? null

  return rows.map((row) => {
    // Default-domain links are stored with the '' sentinel; include them in the default's count.
    const linkCount = row.isDefault
      ? countFor('') + (defaultName ? countFor(defaultName) : 0)
      : countFor(row.name)
    return {
      name: row.name,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      linkCount,
    }
  })
}

export async function createDomain(event: H3Event, name: string): Promise<{ created: boolean, isDefault: boolean }> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const existing = await db.select({ name: domains.name }).from(domains).where(eq(domains.name, name)).limit(1)
  if (existing.length > 0)
    return { created: false, isDefault: false }

  const now = Math.floor(Date.now() / 1000)
  const [totalRow] = await db.select({ count: count() }).from(domains)
  // The first domain automatically becomes the default.
  const isDefault = (totalRow?.count ?? 0) === 0
  await db.insert(domains).values({ name, isDefault, createdAt: now, updatedAt: now }).onConflictDoNothing()
  await invalidateDomainCache(event)
  return { created: true, isDefault }
}

export async function setDefaultDomain(event: H3Event, name: string): Promise<boolean> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const rows = await db.select({ name: domains.name }).from(domains).where(eq(domains.name, name)).limit(1)
  if (rows.length === 0)
    return false

  const now = Math.floor(Date.now() / 1000)
  await db.batch([
    db.update(domains).set({ isDefault: false }).where(ne(domains.name, name)),
    db.update(domains).set({ isDefault: true, updatedAt: now }).where(eq(domains.name, name)),
  ])
  await invalidateDomainCache(event)
  return true
}

export type DeleteDomainReason = 'not-found' | 'default' | 'has-links'

export async function deleteDomain(
  event: H3Event,
  name: string,
): Promise<{ deleted: boolean, reason?: DeleteDomainReason, linkCount?: number }> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const row = await db
    .select({ name: domains.name, isDefault: domains.isDefault })
    .from(domains)
    .where(eq(domains.name, name))
    .limit(1)
  if (row.length === 0)
    return { deleted: false, reason: 'not-found' }
  if (row[0]?.isDefault)
    return { deleted: false, reason: 'default' }

  const [linkCountRow] = await db.select({ count: count() }).from(links).where(eq(links.domain, name))
  const linkCount = linkCountRow?.count ?? 0
  if (linkCount > 0)
    return { deleted: false, reason: 'has-links', linkCount }

  await db.delete(domains).where(eq(domains.name, name))
  await invalidateDomainCache(event)
  return { deleted: true }
}

export async function countLinksForDomain(event: H3Event, domain: string): Promise<number> {
  const db = drizzle(event.context.cloudflare.env.DB)
  const [row] = await db.select({ count: count() }).from(links).where(eq(links.domain, domain))
  return row?.count ?? 0
}
