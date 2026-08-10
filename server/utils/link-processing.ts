import type { H3Event } from 'h3'
import type { EditLink, Link } from '#shared/schemas/link'
import { getDefaultDomain, getDomains, isDomainRegistered } from '../services/domain-store'
import { canonicalizeDomain } from './domain'

const editableOptionalLinkFields = [
  'comment',
  'title',
  'description',
  'image',
  'apple',
  'google',
  'cloaking',
  'redirectWithQuery',
  'expiration',
  'unsafe',
  'geo',
  'tags',
] as const satisfies readonly (keyof Link)[]

interface LinkResponse {
  link: Link
  shortLink: string
}

export async function prepareIncomingLink(event: H3Event, link: Link): Promise<void> {
  link.slug = normalizeSlug(event, link.slug)
  await canonicalizeLinkDomain(event, link)
  await detectUnsafeLink(event, link)
}

// Canonicalize the submitted domain and reject unknown hosts. Selecting the default
// domain stores the '' sentinel; non-default hosts must be registered.
export async function canonicalizeLinkDomain(event: H3Event, link: Pick<Link, 'domain'>): Promise<void> {
  const defaultDomain = await getDefaultDomain(event)
  const domain = canonicalizeDomain(link.domain, defaultDomain)
  if (domain !== '' && !await isDomainRegistered(event, domain)) {
    throw createError({
      status: 400,
      statusText: 'Unknown domain',
    })
  }
  link.domain = domain
}

// Imported links fall back to the default domain ('' sentinel) when their domain is
// missing or no longer registered.
export async function resolveImportDomain(event: H3Event, submitted: string): Promise<string> {
  const defaultDomain = await getDefaultDomain(event)
  const domain = canonicalizeDomain(submitted, defaultDomain)
  if (domain === '')
    return ''
  const { domains } = await getDomains(event)
  return domains.includes(domain) ? domain : ''
}

export async function detectUnsafeLink(event: H3Event, link: Pick<Link, 'url' | 'unsafe'>): Promise<void> {
  if (link.unsafe !== undefined)
    return

  const safe = await isSafeUrl(event, link.url)
  if (!safe)
    link.unsafe = true
}

export async function hashLinkPasswordForCreate(link: Link): Promise<void> {
  if (link.password)
    link.password = await hashLinkPassword(link.password)
}

export async function buildLinkResponse(event: H3Event, link: Link): Promise<LinkResponse> {
  return {
    link: sanitizeLinkPassword(link),
    shortLink: await buildShortLink(event, link.domain, link.slug),
  }
}

export function mergeEditableLink(existingLink: Link, link: EditLink): Link {
  const { password: _password, ...linkWithoutPassword } = link
  const newLink = {
    ...existingLink,
    ...linkWithoutPassword,
    id: existingLink.id,
    createdAt: existingLink.createdAt,
    updatedAt: Math.max(Math.floor(Date.now() / 1000), existingLink.updatedAt + 1),
  }

  cleanupOptionalLinkFields(newLink, link)

  return newLink
}

export async function applyEditableLinkPassword(newLink: Link, password?: string): Promise<void> {
  if (password === '') {
    delete newLink.password
  }
  else if (password !== undefined) {
    newLink.password = await hashLinkPassword(password)
  }
  else if (newLink.password) {
    newLink.password = await normalizeLinkPasswordForStorage(newLink.password)
  }
}

function cleanupOptionalLinkFields(newLink: Link, link: EditLink): void {
  for (const field of editableOptionalLinkFields) {
    if (link[field] === undefined)
      delete newLink[field]
  }
}
