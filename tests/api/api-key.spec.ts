import type { ApiKeyScope } from '../../shared/schemas/api-key'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearApiKeys, deleteStoredLinks, fetch, insertDomain, postJson, putJson, setLinkStoreD1Mode } from '../utils'

const TEST_DOMAIN = 'example.com'
const createdSlugs = new Set<string>()

interface CreatedApiKey {
  key: {
    id: string
    name: string
    scopes: ApiKeyScope[]
    tokenPrefix: string
  }
  token: string
}

function trackSlug(slug: string) {
  createdSlugs.add(slug)
  return slug
}

function createLinkPayload() {
  return {
    url: 'https://example.com',
    slug: trackSlug(`api-key-${crypto.randomUUID()}`),
    domain: TEST_DOMAIN,
  }
}

async function createApiKey(scopes?: ApiKeyScope[], options: { name?: string, expiresAt?: number } = {}) {
  const body: { name: string, scopes?: ApiKeyScope[], expiresAt?: number } = {
    name: options.name ?? `test-${crypto.randomUUID()}`,
  }
  if (scopes !== undefined)
    body.scopes = scopes
  if (options.expiresAt !== undefined)
    body.expiresAt = options.expiresAt

  const response = await postJson('/api/api-key/create', body)
  expect(response.status).toBe(201)
  return await response.json() as CreatedApiKey
}

function fetchWithApiKey(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  })
}

function postJsonWithApiKey(path: string, token: string, body: unknown): Promise<Response> {
  return fetchWithApiKey(path, token, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(async () => {
  await setLinkStoreD1Mode()
  await insertDomain(TEST_DOMAIN, true)
})

afterEach(async () => {
  await clearApiKeys()
  await deleteStoredLinks([...createdSlugs])
  createdSlugs.clear()
})

describe('/api/api-key', { concurrent: false }, () => {
  it('requires site-token auth for management endpoints', async () => {
    const listResponse = await fetch('/api/api-key/list')
    expect(listResponse.status).toBe(401)

    const createResponse = await postJson('/api/api-key/create', { name: `test-${crypto.randomUUID()}` }, false)
    expect(createResponse.status).toBe(401)
  })

  it('creates a key with both default scopes and a one-time token', async () => {
    const created = await createApiKey()

    expect(created.key.id).not.toBe('')
    expect(created.key.scopes).toEqual(expect.arrayContaining(['links:read', 'links:write']))
    expect(created.token.startsWith(created.key.tokenPrefix)).toBe(true)
    expect(created.token.startsWith('sk_')).toBe(true)

    const serialized = JSON.stringify(created)
    expect(serialized).not.toContain('token_hash')
    expect(serialized).not.toContain('tokenHash')
  })

  it('creates a key with the requested scopes', async () => {
    const created = await createApiKey(['links:read'])

    expect(created.key.scopes).toEqual(['links:read'])
  })

  it('returns 401 for an invalid API key token', async () => {
    const response = await fetch('/api/verify', {
      headers: { Authorization: 'Bearer sk_not-a-real-key' },
    })

    expect(response.status).toBe(401)
  })

  it('verifies a valid API key and reports its identity', async () => {
    const created = await createApiKey()
    const response = await fetchWithApiKey('/api/verify', created.token)

    expect(response.status).toBe(200)
    const data = await response.json() as { authMethod: string, userID: string }
    expect(data.authMethod).toBe('api-key')
    expect(data.userID).toBe(`api-key:${created.key.id}`)
  })

  it('allows a read-only key to read links', async () => {
    const created = await createApiKey(['links:read'])
    const listResponse = await fetchWithApiKey('/api/link/list?limit=1&status=all', created.token)
    expect(listResponse.status).toBe(200)

    const queryResponse = await fetchWithApiKey(`/api/link/query?slug=api-key-missing-${crypto.randomUUID()}`, created.token)
    expect(queryResponse.status).toBe(404)
  })

  it('rejects a read-only key from writing links', async () => {
    const created = await createApiKey(['links:read'])
    const response = await postJsonWithApiKey('/api/link/create', created.token, createLinkPayload())

    expect(response.status).toBe(403)
  })

  it('creates a link with a full-permission API key', async () => {
    const created = await createApiKey(['links:read', 'links:write'])
    const payload = createLinkPayload()
    const response = await postJsonWithApiKey('/api/link/create', created.token, payload)

    expect(response.status).toBe(201)
    const data = await response.json() as { link: { slug: string } }
    expect(data.link.slug).toBe(payload.slug)
  })

  it('deletes a link with a full-permission API key', async () => {
    const created = await createApiKey(['links:read', 'links:write'])
    const payload = createLinkPayload()
    const createResponse = await postJsonWithApiKey('/api/link/create', created.token, payload)
    expect(createResponse.status).toBe(201)

    const deleteResponse = await postJsonWithApiKey('/api/link/delete', created.token, {
      slug: payload.slug,
      domain: TEST_DOMAIN,
    })
    expect(deleteResponse.status).toBe(204)
  })

  it('rejects API keys from routes outside the allowlist', async () => {
    const created = await createApiKey(['links:read', 'links:write'])

    const metricsResponse = await fetchWithApiKey('/api/stats/metrics', created.token)
    expect(metricsResponse.status).toBe(403)

    const listResponse = await fetchWithApiKey('/api/api-key/list', created.token)
    expect(listResponse.status).toBe(403)
  })

  it('updates an API key name and scopes', async () => {
    const created = await createApiKey(['links:read', 'links:write'])
    const renameResponse = await putJson('/api/api-key/edit', { id: created.key.id, name: 'renamed' })
    expect(renameResponse.status).toBe(200)
    const renamed = await renameResponse.json() as { key: { name: string } }
    expect(renamed.key.name).toBe('renamed')

    const scopeResponse = await putJson('/api/api-key/edit', { id: created.key.id, scopes: ['links:read'] })
    expect(scopeResponse.status).toBe(200)

    const denied = await postJsonWithApiKey('/api/link/create', created.token, createLinkPayload())
    expect(denied.status).toBe(403)
  })

  it('rotates an API key, invalidating the previous secret', async () => {
    const created = await createApiKey()

    const beforeRotate = await fetchWithApiKey('/api/link/list?limit=1&status=all', created.token)
    expect(beforeRotate.status).toBe(200)

    const rotateResponse = await postJson('/api/api-key/rotate', { id: created.key.id })
    expect(rotateResponse.status).toBe(200)
    const rotated = await rotateResponse.json() as CreatedApiKey
    expect(rotated.token.startsWith('sk_')).toBe(true)
    expect(rotated.token).not.toBe(created.token)
    expect(rotated.key.id).toBe(created.key.id)
    expect(rotated.key.name).toBe(created.key.name)
    expect(rotated.key.scopes).toEqual(created.key.scopes)

    const staleVerify = await fetchWithApiKey('/api/verify', created.token)
    expect(staleVerify.status).toBe(401)

    const freshVerify = await fetchWithApiKey('/api/verify', rotated.token)
    expect(freshVerify.status).toBe(200)

    const afterRotate = await fetchWithApiKey('/api/link/list?limit=1&status=all', rotated.token)
    expect(afterRotate.status).toBe(200)
  })

  it('deletes an API key and immediately disables it', async () => {
    const created = await createApiKey()
    const deleteResponse = await postJson('/api/api-key/delete', { id: created.key.id })
    expect(deleteResponse.status).toBe(200)

    const verifyResponse = await fetchWithApiKey('/api/verify', created.token)
    expect(verifyResponse.status).toBe(401)
  })

  it('rejects an expired API key', async () => {
    const created = await createApiKey(undefined, {
      expiresAt: Math.floor(Date.now() / 1000) - 3600,
    })
    const verifyResponse = await fetchWithApiKey('/api/verify', created.token)

    expect(verifyResponse.status).toBe(401)
  })

  it('rejects an empty key name', async () => {
    const response = await postJson('/api/api-key/create', { name: '' })

    expect(response.status).toBe(400)
  })

  it('returns 404 for unknown management targets', async () => {
    const id = `missing-${crypto.randomUUID()}`

    const editResponse = await putJson('/api/api-key/edit', { id, name: 'renamed' })
    expect(editResponse.status).toBe(404)

    const rotateResponse = await postJson('/api/api-key/rotate', { id })
    expect(rotateResponse.status).toBe(404)

    const deleteResponse = await postJson('/api/api-key/delete', { id })
    expect(deleteResponse.status).toBe(404)
  })
})
