import { exports } from 'cloudflare:workers'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearDomains, clearLinks, fetchWithAuth, insertDomain, postJson, putJson, setLinkStoreD1Mode } from '../utils'

const createdSlugs = new Set<string>()
const createdDomains = new Set<string>()

function trackSlug(slug: string) {
  createdSlugs.add(slug)
  return slug
}

function trackDomain(name: string) {
  createdDomains.add(name)
  return name
}

async function deleteDomainViaApi(name: string) {
  return await fetchWithAuth(`/api/domain/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

function fetchOnHost(host: string, path: string, options?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`http://${host}${path}`, options))
}

beforeEach(async () => {
  await setLinkStoreD1Mode()
  // The shared worker persists D1 state across files; clear both so counts and
  // delete guards are deterministic for this file's domain tests.
  await clearDomains()
  await clearLinks()
})

afterEach(async () => {
  await clearDomains()
  await clearLinks()
  createdSlugs.clear()
  createdDomains.clear()
})

describe('/api/domain', { concurrent: false }, () => {
  it('creates a domain and makes the first one the default', async () => {
    const first = await postJson('/api/domain', { name: trackDomain('a.example') })
    expect(first.status).toBe(201)
    expect(await first.json()).toEqual({ name: 'a.example', isDefault: true })

    const second = await postJson('/api/domain', { name: trackDomain('b.example') })
    expect(second.status).toBe(201)
    expect(await second.json()).toEqual({ name: 'b.example', isDefault: false })
  })

  it('rejects invalid domain names', async () => {
    // Scheme, port and path are stripped by normalization, so those inputs are accepted.
    for (const name of ['no-dot', 'exa mple.com', 'user@example.com', 'a'.repeat(300), 'example..com']) {
      const response = await postJson('/api/domain', { name })
      expect(response.status, name).toBe(400)
    }
  })

  it('returns 409 for a duplicate domain', async () => {
    await insertDomain(trackDomain('dup.example'))
    const response = await postJson('/api/domain', { name: 'dup.example' })
    expect(response.status).toBe(409)
  })

  it('returns 401 without auth', async () => {
    const response = await exports.default.fetch(new Request('http://localhost/api/domain', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }))
    expect(response.status).toBe(401)
  })

  it('lists domains with link counts and the default flag', async () => {
    await insertDomain(trackDomain('default.example'), true)
    await insertDomain(trackDomain('other.example'), false)

    const slug = trackSlug(`domain-link-${crypto.randomUUID()}`)
    const create = await postJson('/api/link/create', { url: 'https://example.com/target', slug, domain: 'other.example' })
    expect(create.status).toBe(201)

    const response = await fetchWithAuth('/api/domain')
    expect(response.status).toBe(200)
    const data = await response.json() as { name: string, isDefault: boolean, linkCount: number }[]
    const byName = Object.fromEntries(data.map(domain => [domain.name, domain]))
    expect(byName['default.example']?.isDefault).toBe(true)
    expect(byName['other.example']?.isDefault).toBe(false)
    expect(byName['other.example']?.linkCount).toBe(1)
    expect(byName['default.example']?.linkCount).toBe(0)
  })

  it('switches the default domain', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    const response = await putJson('/api/domain/b.example')
    expect(response.status).toBe(200)

    const list = await (await fetchWithAuth('/api/domain')).json() as { name: string, isDefault: boolean }[]
    expect(list.find(domain => domain.name === 'a.example')?.isDefault).toBe(false)
    expect(list.find(domain => domain.name === 'b.example')?.isDefault).toBe(true)
  })

  it('blocks deleting the default domain', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    const response = await deleteDomainViaApi('a.example')
    expect(response.status).toBe(409)
  })

  it('blocks deleting a domain that has links', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    const slug = trackSlug(`protected-${crypto.randomUUID()}`)
    expect((await postJson('/api/link/create', { url: 'https://example.com/target', slug, domain: 'b.example' })).status).toBe(201)

    const response = await deleteDomainViaApi('b.example')
    expect(response.status).toBe(409)
  })

  it('deletes a non-default domain without links', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    const response = await deleteDomainViaApi('b.example')
    expect(response.status).toBe(200)
    createdDomains.delete('b.example')

    const list = await (await fetchWithAuth('/api/domain')).json() as { name: string }[]
    expect(list.find(domain => domain.name === 'b.example')).toBeUndefined()
  })
})

describe('domain-scoped links', { concurrent: false }, () => {
  it('allows the same slug on different domains', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    const slug = trackSlug(`shared-${crypto.randomUUID()}`)
    const a = await postJson('/api/link/create', { url: 'https://a.example/target', slug, domain: 'a.example' })
    const b = await postJson('/api/link/create', { url: 'https://b.example/target', slug, domain: 'b.example' })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)

    const qa = await (await fetchWithAuth(`/api/link/query?slug=${slug}&domain=a.example`)).json() as { url: string }
    const qb = await (await fetchWithAuth(`/api/link/query?slug=${slug}&domain=b.example`)).json() as { url: string }
    expect(qa.url).toBe('https://a.example/target')
    expect(qb.url).toBe('https://b.example/target')
  })

  it('rejects a duplicate slug on the same domain', async () => {
    await insertDomain(trackDomain('a.example'), true)
    const slug = trackSlug(`same-domain-${crypto.randomUUID()}`)
    expect((await postJson('/api/link/create', { url: 'https://x.example/1', slug, domain: 'a.example' })).status).toBe(201)
    expect((await postJson('/api/link/create', { url: 'https://x.example/2', slug, domain: 'a.example' })).status).toBe(409)
  })

  it('rejects an unregistered domain on create', async () => {
    const slug = trackSlug(`unknown-domain-${crypto.randomUUID()}`)
    const response = await postJson('/api/link/create', { url: 'https://example.com', slug, domain: 'unknown.example' })
    expect(response.status).toBe(400)
  })

  it('resolves links only on their own registered domain', async () => {
    await insertDomain(trackDomain('a.example'), true)
    await insertDomain(trackDomain('b.example'), false)

    // a.example is the default domain, so this link is stored with the '' sentinel.
    const defaultSlug = trackSlug(`iso-default-${crypto.randomUUID()}`)
    expect((await postJson('/api/link/create', { url: 'https://a.example/default-target', slug: defaultSlug, domain: 'a.example' })).status).toBe(201)
    // b.example is non-default, so this link is stored with the concrete host.
    const otherSlug = trackSlug(`iso-other-${crypto.randomUUID()}`)
    expect((await postJson('/api/link/create', { url: 'https://b.example/other-target', slug: otherSlug, domain: 'b.example' })).status).toBe(201)

    const onDefault = await fetchOnHost('a.example', `/${defaultSlug}`, { redirect: 'manual' })
    expect(onDefault.status).toBe(301)
    expect(onDefault.headers.get('Location')).toBe('https://a.example/default-target')

    const onOther = await fetchOnHost('b.example', `/${otherSlug}`, { redirect: 'manual' })
    expect(onOther.status).toBe(301)
    expect(onOther.headers.get('Location')).toBe('https://b.example/other-target')

    // Default-domain links do not resolve on another registered domain.
    const miss = await fetchOnHost('b.example', `/${defaultSlug}`, { redirect: 'manual' })
    expect(miss.status).toBe(404)

    // Unregistered hosts (localhost) fall back to the default domain namespace.
    const local = await exports.default.fetch(new Request(`http://localhost/${defaultSlug}`, { redirect: 'manual' }))
    expect(local.status).toBe(301)
    const localMiss = await exports.default.fetch(new Request(`http://localhost/${otherSlug}`, { redirect: 'manual' }))
    expect(localMiss.status).toBe(404)
  })
})
