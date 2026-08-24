import type { H3Event } from 'h3'
import type { ApiKeyScope, StoredApiKey } from '#shared/schemas/api-key'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { API_KEY_TOKEN_PREFIX, ApiKeyScopesSchema } from '#shared/schemas/api-key'
import { nanoid } from '#shared/schemas/link'
import { apiKeys } from '../database/schema'

type ApiKeyRow = typeof apiKeys.$inferSelect

// The opaque prefix is 3 characters; expose the first 11 of every token
// (prefix + 8 random chars) so the dashboard can display it without leaking the secret.
const TOKEN_DISPLAY_CHARS = API_KEY_TOKEN_PREFIX.length + 8
// Tokens are 40 random nanoid chars after the prefix.
const TOKEN_RANDOM_LENGTH = 40
// Skip the `last_used_at` write when the previous touch is more recent than this.
const USAGE_TOUCH_INTERVAL_SECONDS = 60

function getDatabase(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB)
}

/** SHA-256 hex digest of the bearer token. Compared with the stored `token_hash` row. */
async function hashApiToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Mint a new opaque API token shaped as `${prefix}${40 random chars}`. */
export function generateApiToken(): string {
  return `${API_KEY_TOKEN_PREFIX}${nanoid(TOKEN_RANDOM_LENGTH)()}`
}

/** Public-facing prefix of a token (never includes the secret suffix). */
export function apiTokenPrefix(token: string): string {
  return token.slice(0, TOKEN_DISPLAY_CHARS)
}

/** Resolved identity attached to the event context after API key authentication. */
export interface ApiKeyIdentity {
  id: string
  name: string
  scopes: ApiKeyScope[]
  lastUsedAt: number | null
}

/**
 * Routes that API keys may access, mapped to the scopes each HTTP method requires.
 * A missing entry (or missing method) means API keys are not allowed on that route.
 */
const OPEN_API_ROUTE_SCOPES: Record<string, Record<string, ApiKeyScope[]>> = {
  '/api/verify': { GET: [] },
  '/api/link/query': { GET: ['links:read'] },
  '/api/link/list': { GET: ['links:read'] },
  '/api/link/search': { GET: ['links:read'] },
  '/api/link/count': { GET: ['links:read'] },
  '/api/link/tags': { GET: ['links:read'] },
  '/api/link/create': { POST: ['links:write'] },
  '/api/link/upsert': { POST: ['links:write'] },
  '/api/link/edit': { PUT: ['links:write'] },
  '/api/link/delete': { POST: ['links:write'] },
}

/** Returns required scopes for the route/method, or null when API keys cannot access it. */
export function resolveOpenApiScopes(path: string, method: string): ApiKeyScope[] | null {
  return OPEN_API_ROUTE_SCOPES[path]?.[method.toUpperCase()] ?? null
}

/**
 * Resolve an API key identity from a raw bearer token.
 * Returns null when the row is missing, revoked, or expired.
 */
export async function verifyApiKey(event: H3Event, token: string): Promise<ApiKeyIdentity | null> {
  const tokenHash = await hashApiToken(token)
  const row = await getDatabase(event)
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.tokenHash, tokenHash))
    .limit(1)
    .then(rows => rows[0])
  if (!row)
    return null
  if (row.revokedAt !== null)
    return null
  const now = Math.floor(Date.now() / 1000)
  if (row.expiresAt !== null && row.expiresAt <= now)
    return null

  const scopes = z.array(ApiKeyScopesSchema).parse(row.scopes)
  return {
    id: row.id,
    name: row.name,
    scopes,
    lastUsedAt: row.lastUsedAt,
  }
}

/**
 * Best-effort, throttled update of `last_used_at`.
 * Skips writes that would land within `USAGE_TOUCH_INTERVAL_SECONDS` of the previous touch.
 */
export function touchApiKeyUsage(event: H3Event, apiKey: ApiKeyIdentity): void {
  const now = Math.floor(Date.now() / 1000)
  if (apiKey.lastUsedAt !== null && now - apiKey.lastUsedAt < USAGE_TOUCH_INTERVAL_SECONDS)
    return

  event.context.cloudflare.context.waitUntil(
    getDatabase(event).update(apiKeys)
      .set({ lastUsedAt: now })
      .where(eq(apiKeys.id, apiKey.id))
      .catch(() => {
        // Usage telemetry is best-effort; never let an audit write fail the request.
      }),
  )
}

/** Mask a DB row to the public StoredApiKey shape (no hash, no token). */
function rowToStoredApiKey(row: ApiKeyRow): StoredApiKey {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: z.array(ApiKeyScopesSchema).parse(row.scopes),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
  }
}

/**
 * Persist a freshly minted API key. The plaintext token is returned exactly once
 * alongside the masked StoredApiKey so the dashboard can show it to the user.
 */
export async function createApiKeyRecord(
  event: H3Event,
  input: { name: string, scopes: ApiKeyScope[], expiresAt?: number },
): Promise<{ key: StoredApiKey, token: string }> {
  const token = generateApiToken()
  const now = Math.floor(Date.now() / 1000)
  const row: ApiKeyRow = {
    id: nanoid(10)(),
    name: input.name,
    tokenHash: await hashApiToken(token),
    tokenPrefix: apiTokenPrefix(token),
    scopes: input.scopes,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    expiresAt: input.expiresAt ?? null,
    revokedAt: null,
  }
  await getDatabase(event).insert(apiKeys).values(row)
  return {
    key: rowToStoredApiKey(row),
    token,
  }
}

/** List all API keys ordered by most recently created first. */
export async function listApiKeyRecords(event: H3Event): Promise<StoredApiKey[]> {
  const rows = await getDatabase(event)
    .select()
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
  return rows.map(rowToStoredApiKey)
}

/** Update an API key's name and/or scopes. Returns null when the id is unknown. */
export async function updateApiKeyRecord(
  event: H3Event,
  input: { id: string, name?: string, scopes?: ApiKeyScope[] },
): Promise<StoredApiKey | null> {
  const now = Math.floor(Date.now() / 1000)
  const patch: Partial<ApiKeyRow> = { updatedAt: now }
  if (input.name !== undefined)
    patch.name = input.name
  if (input.scopes !== undefined)
    patch.scopes = input.scopes

  const rows = await getDatabase(event)
    .update(apiKeys)
    .set(patch)
    .where(eq(apiKeys.id, input.id))
    .returning()
  const row = rows[0]
  return row ? rowToStoredApiKey(row) : null
}

/**
 * Mint a fresh secret for an existing API key. The previous token is invalidated
 * immediately because the stored hash is replaced. The row's name, scopes,
 * expiration, and history (createdAt, lastUsedAt) are preserved; revokedAt is
 * reset to NULL so a previously revoked row cannot be silently rotated back to
 * life — only active keys are eligible. Returns null when the id is unknown or
 * the key is already revoked.
 */
export async function rotateApiKeyRecord(
  event: H3Event,
  id: string,
): Promise<{ key: StoredApiKey, token: string } | null> {
  const token = generateApiToken()
  const now = Math.floor(Date.now() / 1000)
  const rows = await getDatabase(event)
    .update(apiKeys)
    .set({
      tokenHash: await hashApiToken(token),
      tokenPrefix: apiTokenPrefix(token),
      updatedAt: now,
      revokedAt: null,
    })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning()
  const row = rows[0]
  if (!row)
    return null
  return {
    key: rowToStoredApiKey(row),
    token,
  }
}

/** Permanently delete an API key row. Returns false when the id is unknown. */
export async function deleteApiKeyRecord(event: H3Event, id: string): Promise<boolean> {
  const rows = await getDatabase(event)
    .delete(apiKeys)
    .where(eq(apiKeys.id, id))
    .returning({ id: apiKeys.id })
  return rows.length > 0
}
