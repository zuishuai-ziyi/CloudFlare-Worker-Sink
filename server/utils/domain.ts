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

// Candidate domains to try when resolving slug on a request host. Short links only
// resolve on their own registered domains: the default-domain namespace ('' sentinel)
// is reachable only via the default domain's host, and no fallback is made for
// unregistered hosts (localhost, *.workers.dev, or the dashboard's own host).
export async function getEffectiveDomains(event: H3Event): Promise<string[]> {
  const { domains, default: defaultDomain } = await getDomains(event)
  const host = normalizeHost(getRequestHost(event))
  const registered = new Set(domains)
  if (registered.has(host))
    return host === defaultDomain ? [host, ''] : [host]
  return []
}
