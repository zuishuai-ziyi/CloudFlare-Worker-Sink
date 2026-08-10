import { z } from 'zod'

// A lowercase host with at least one dot, no scheme/path/port. Accepts punycode (xn--).
const DOMAIN_REGEX = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// Normalize a user-submitted domain: strip scheme, port, path and trailing slashes, lowercase.
function normalizeDomain(value: string): string {
  let v = value.trim().toLowerCase()
  v = v.replace(/^[a-z]+:\/\//, '')
  v = v.replace(/:\d+$/, '')
  v = v.replace(/\/.*$/, '')
  return v
}

export const DomainSchema = z.preprocess(
  value => (typeof value === 'string' ? normalizeDomain(value) : value),
  z.string().trim().max(253).regex(DOMAIN_REGEX, 'invalid domain'),
)

// '' is the sentinel for "the current default domain". Stored links may use it.
export const StoredDomainSchema = z.union([DomainSchema, z.literal('')])

export const CreateDomainSchema = z.object({
  name: DomainSchema,
})

export type Domain = z.infer<typeof DomainSchema>
