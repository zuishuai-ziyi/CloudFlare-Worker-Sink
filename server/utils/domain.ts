import type { H3Event } from 'h3'
import { getRequestHost } from 'h3'
import { getDomains } from '../services/domain-store'

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, '')
}

// Stable key for a (domain, slug) pair. '' is the default-domain sentinel.
// Neither a domain nor a slug may contain '|'.
export function compositeKey(domain: string, slug: string): string {
  return `${domain}|${slug}`
}

// Canonicalize a submitted domain: if it matches the current default domain, store the
// '' sentinel so the link follows the default domain if it is later switched.
export function canonicalizeDomain(submitted: string, defaultDomain: string | null): string {
  if (submitted === '')
    return ''
  return defaultDomain && submitted === defaultDomain ? '' : submitted
}

// Candidate domains to try when resolving slug on a request host:
// - registered hosts resolve their own namespace only (plus '' when they are the default)
// - unregistered hosts (localhost, *.workers.dev) fall back to the default namespace ''
export async function getEffectiveDomains(event: H3Event): Promise<string[]> {
  const { domains, default: defaultDomain } = await getDomains(event)
  const host = normalizeHost(getRequestHost(event))
  const registered = new Set(domains)
  if (registered.has(host))
    return host === defaultDomain ? [host, ''] : [host]
  return ['']
}
