import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'
import { parseLegacyKvLink } from '#shared/schemas/link'
import { getExpiration } from '../../utils/time'

export interface LegacyKvLinkResult {
  link: Link | null
  metadata: Record<string, unknown> | null
}

function isActiveExpiration(expiration: number | null | undefined): boolean {
  return expiration === null || expiration === undefined || expiration > Math.floor(Date.now() / 1000)
}

function logCacheError(operation: string, key: string, error: unknown): void {
  console.error({
    event: 'link_cache.operation.failed',
    operation,
    key,
    error: error instanceof Error ? error.message : String(error),
  })
}

// Cache key scheme: `link:{domain}:{slug}`. '' is the default-domain sentinel,
// producing the key `link::{slug}`.
function linkCacheKey(domain: string, slug: string): string {
  return `link:${domain}:${slug}`
}

export async function readLegacyKvLink(event: H3Event, domain: string, slug: string, cacheTtl?: number): Promise<LegacyKvLinkResult> {
  return readLegacyKvLinkByKey(event, linkCacheKey(domain, slug), slug, cacheTtl)
}

// Transition fallback: reads the pre-multi-domain key `link:{slug}` so legacy links
// keep resolving until the KV-to-D1 migration completes.
export async function readLegacyKvLinkLegacy(event: H3Event, slug: string, cacheTtl?: number): Promise<LegacyKvLinkResult> {
  return readLegacyKvLinkByKey(event, `link:${slug}`, slug, cacheTtl)
}

async function readLegacyKvLinkByKey(event: H3Event, key: string, slug: string, cacheTtl?: number): Promise<LegacyKvLinkResult> {
  const result = await event.context.cloudflare.env.KV.getWithMetadata(key, { type: 'json', cacheTtl })
  const parsed = parseLegacyKvLink(result.value, slug)
  const metadata = result.metadata as Record<string, unknown> | null
  const metadataExpiration = typeof metadata?.expiration === 'number' ? metadata.expiration : undefined

  if (!parsed.success)
    return { link: null, metadata }

  const effectiveExpiration = metadataExpiration ?? parsed.data.expiration
  if (!isActiveExpiration(effectiveExpiration))
    return { link: null, metadata }

  return { link: parsed.data, metadata }
}

export async function putLinkCache(event: H3Event, link: Link, effectiveExpiresAt?: number | null): Promise<boolean> {
  const expiration = effectiveExpiresAt === undefined ? getExpiration(event, link.expiration) : effectiveExpiresAt ?? undefined
  const key = linkCacheKey(link.domain, link.slug)
  try {
    await event.context.cloudflare.env.KV.put(key, JSON.stringify(link), { expiration })
    return true
  }
  catch (error) {
    logCacheError('put', key, error)
    return false
  }
}

export async function deleteLinkCache(event: H3Event, domain: string, slug: string): Promise<void> {
  const key = linkCacheKey(domain, slug)
  try {
    await event.context.cloudflare.env.KV.delete(key)
  }
  catch (error) {
    logCacheError('delete', key, error)
  }
}

export function isActiveLinkExpiration(expiration: number | null | undefined): boolean {
  return isActiveExpiration(expiration)
}
