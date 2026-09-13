import type { Link } from '../shared/schemas/link'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { and, eq, ne } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { expect } from 'vitest'
import { apiKeys, domains, linkMigrationRuns, links, linkTags, linkTombstones } from '../server/database/schema'
import { LINK_PASSWORD_HASH_PREFIX, LINK_PASSWORD_MASK_PREFIX } from '../shared/utils/link-password'
import { getTestServer, onTestServerStop, testDataDir } from './server'

// Tests talk to a real Nitro server over HTTP. The `Host` header is pinned to a
// registered domain while the socket connects to 127.0.0.1, which Node's global
// `fetch` refuses to do (it drops a caller-supplied `host`), so a tiny
// `node:http` client provides fetch-like responses instead.

const TEST_HOST = 'example.com'

const dataDir = testDataDir()
mkdirSync(dataDir, { recursive: true })

const sqlite = new Database(join(dataDir, 'sink.db'))
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('busy_timeout = 5000')

// The server's teardown removes the data directory; on Windows an open SQLite
// handle blocks that, so close this connection before the directory is removed.
onTestServerStop(() => sqlite.close())

/** Drizzle handle over the same SQLite file the server uses (WAL-safe). */
export const db = drizzle(sqlite)

/** Runs a raw query against the test database; mirrors `D1.prepare().all()`. */
export function queryAll<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return sqlite.prepare(sql).all(...params) as T[]
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

interface TestFetchInit {
  method?: string
  headers?: HeadersInit
  body?: string | Uint8Array | ArrayBuffer | URLSearchParams | FormData | null
  redirect?: 'manual' | 'follow' | 'error'
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers)
    return {}
  if (headers instanceof Headers)
    return Object.fromEntries(headers.entries())
  if (Array.isArray(headers))
    return Object.fromEntries(headers.map(([name, value]) => [name, String(value)]))
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name, String(value)]))
}

interface EncodedBody {
  buffer: Buffer
  contentType?: string
}

async function encodeBody(body: TestFetchInit['body']): Promise<EncodedBody | null> {
  if (body === undefined || body === null)
    return null
  if (typeof body === 'string')
    return { buffer: Buffer.from(body) }
  if (body instanceof URLSearchParams)
    return { buffer: Buffer.from(body.toString()) }
  if (body instanceof Uint8Array)
    return { buffer: Buffer.from(body) }
  if (body instanceof ArrayBuffer)
    return { buffer: Buffer.from(body) }
  if (typeof FormData !== 'undefined' && body instanceof FormData)
    return await encodeFormData(body)
  return { buffer: Buffer.from(String(body)) }
}

async function encodeFormData(form: FormData): Promise<EncodedBody> {
  const boundary = `----SinkTestBoundary${randomUUID().replace(/-/g, '')}`
  const chunks: Buffer[] = []
  for (const [name, value] of form.entries()) {
    chunks.push(Buffer.from(`--${boundary}\r\n`))
    if (typeof value === 'string') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
      continue
    }
    const filename = 'name' in value && typeof value.name === 'string' ? value.name : 'blob'
    const type = value.type || 'application/octet-stream'
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`))
    chunks.push(Buffer.from(await value.arrayBuffer()))
    chunks.push(Buffer.from('\r\n'))
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`))
  return {
    buffer: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  }
}

async function request(host: string, path: string, init: TestFetchInit = {}, withAuth = false): Promise<Response> {
  const { port, token } = await getTestServer()
  const headers = toHeaderRecord(init.headers)
  headers.host = host
  if (withAuth)
    headers.authorization = `Bearer ${token}`

  const encoded = await encodeBody(init.body)
  if (encoded) {
    if (encoded.contentType && !headers['content-type'])
      headers['content-type'] = encoded.contentType
    headers['content-length'] = String(encoded.buffer.byteLength)
  }

  const response = await new Promise<http.IncomingMessage>((resolveResponse, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method: init.method ?? 'GET',
      headers,
    }, resolveResponse)
    req.on('error', reject)
    if (encoded)
      req.write(encoded.buffer)
    req.end()
  })

  const chunks: Buffer[] = []
  for await (const chunk of response)
    chunks.push(chunk as Buffer)
  const body = Buffer.concat(chunks)

  const responseHeaders = new Headers()
  for (let i = 0; i < response.rawHeaders.length; i += 2)
    responseHeaders.append(response.rawHeaders[i]!, response.rawHeaders[i + 1]!)

  return new Response(body.byteLength > 0 ? body : null, {
    status: response.statusCode ?? 0,
    statusText: response.statusMessage ?? '',
    headers: responseHeaders,
  })
}

export function fetchWithAuth(path: string, init?: TestFetchInit): Promise<Response> {
  return request(TEST_HOST, path, init, true)
}

export function fetch(path: string, init?: TestFetchInit): Promise<Response> {
  return request(TEST_HOST, path, init)
}

export function fetchOnHost(host: string, path: string, init?: TestFetchInit): Promise<Response> {
  return request(host, path, init)
}

export function postJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  return fn(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function putJson(path: string, body: unknown, withAuth = true): Promise<Response> {
  const fn = withAuth ? fetchWithAuth : fetch
  return fn(path, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

export function linkCacheKey(domain: string, slug: string): string {
  return `link:${domain}:${slug}`
}

// --- Key-value store helpers (the Node emulation persists KV in `kv_store`) ---

interface KvRow {
  value: string | null
  metadata: string | null
  expires_at: number | null
}

function readKvRow(key: string): KvRow | undefined {
  sqlite.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowSeconds())
  return sqlite.prepare('SELECT value, metadata, expires_at FROM kv_store WHERE key = ?').get(key) as KvRow | undefined
}

function decodeKvValue(value: string | null, type?: 'text' | 'json'): unknown {
  if (value === null)
    return null
  return type === 'json' ? JSON.parse(value) : value
}

export async function getKV<T = string>(key: string, options?: { type?: 'text' | 'json' }): Promise<T | null> {
  const row = readKvRow(key)
  return decodeKvValue(row?.value ?? null, options?.type) as T | null
}

export async function getWithMetadataKV<T = unknown>(key: string, options?: { type?: 'text' | 'json' }): Promise<{ value: T | null, metadata: unknown, cacheStatus: null }> {
  const row = readKvRow(key)
  return {
    value: decodeKvValue(row?.value ?? null, options?.type) as T | null,
    metadata: row?.metadata ? JSON.parse(row.metadata) : null,
    cacheStatus: null,
  }
}

export async function putKV(key: string, value: unknown, options?: { expiration?: number, expirationTtl?: number, metadata?: unknown }): Promise<void> {
  const stored = typeof value === 'string' ? value : JSON.stringify(value)
  const metadata = options?.metadata === undefined ? null : JSON.stringify(options.metadata)
  let expiresAt: number | null = null
  if (typeof options?.expiration === 'number')
    expiresAt = options.expiration
  else if (typeof options?.expirationTtl === 'number')
    expiresAt = nowSeconds() + options.expirationTtl

  sqlite.prepare(`
    INSERT INTO kv_store (key, value, metadata, expires_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, metadata = excluded.metadata, expires_at = excluded.expires_at
  `).run(key, stored, metadata, expiresAt)
}

export async function deleteKV(key: string): Promise<void> {
  sqlite.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
}

export async function listKV(prefix = ''): Promise<{ keys: { name: string }[], list_complete: boolean }> {
  sqlite.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowSeconds())
  const rows = sqlite.prepare('SELECT key FROM kv_store WHERE substr(key, 1, ?) = ? ORDER BY key ASC')
    .all(prefix.length, prefix) as { key: string }[]
  return { keys: rows.map(row => ({ name: row.key })), list_complete: true }
}

// --- R2 helpers (the Node emulation stores objects under `<dataDir>/r2`) ---

const R2_ROOT = join(dataDir, 'r2')
const R2_META_SUFFIX = '.meta.json'

interface R2StoredMetadata {
  size: number
  etag: string
  uploaded: string
  httpMetadata: Record<string, string | undefined> | null
  customMetadata: Record<string, string> | null
}

export interface TestR2Object {
  key: string
  size: number
  etag: string
  uploaded: string
  httpMetadata: Record<string, string | undefined> | null
  customMetadata: Record<string, string> | null
  text: () => Promise<string>
  json: <T = unknown>() => Promise<T>
  arrayBuffer: () => Promise<ArrayBuffer>
}

function r2FilePath(key: string): string {
  return resolve(R2_ROOT, ...key.split('/'))
}

function readR2Metadata(key: string): R2StoredMetadata | null {
  try {
    return JSON.parse(readFileSync(r2FilePath(key) + R2_META_SUFFIX, 'utf8')) as R2StoredMetadata
  }
  catch {
    return null
  }
}

export async function getR2(key: string): Promise<TestR2Object | null> {
  const filePath = r2FilePath(key)
  let buffer: Buffer
  try {
    buffer = readFileSync(filePath)
  }
  catch {
    return null
  }
  const metadata = readR2Metadata(key) ?? {
    size: buffer.length,
    etag: '',
    uploaded: new Date().toISOString(),
    httpMetadata: null,
    customMetadata: null,
  }
  return {
    key,
    size: metadata.size,
    etag: metadata.etag,
    uploaded: metadata.uploaded,
    httpMetadata: metadata.httpMetadata,
    customMetadata: metadata.customMetadata,
    text: async () => buffer.toString('utf8'),
    json: async <T = unknown>() => JSON.parse(buffer.toString('utf8')) as T,
    arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  }
}

export async function putR2(key: string, value: string | Uint8Array, options?: { httpMetadata?: Record<string, string>, customMetadata?: Record<string, string> }): Promise<void> {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  const filePath = r2FilePath(key)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, buffer)
  const metadata: R2StoredMetadata = {
    size: buffer.length,
    etag: '',
    uploaded: new Date().toISOString(),
    httpMetadata: options?.httpMetadata ?? null,
    customMetadata: options?.customMetadata ?? null,
  }
  writeFileSync(filePath + R2_META_SUFFIX, JSON.stringify(metadata))
}

export async function deleteR2(key: string): Promise<void> {
  const filePath = r2FilePath(key)
  rmSync(filePath, { force: true })
  rmSync(filePath + R2_META_SUFFIX, { force: true })
}

function collectR2Keys(directory: string, prefix: string, output: string[]): void {
  let entries: ReturnType<typeof readdirSync>
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  }
  catch {
    return
  }
  for (const entry of entries) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory())
      collectR2Keys(join(directory, entry.name), key, output)
    else if (!entry.name.endsWith(R2_META_SUFFIX))
      output.push(key)
  }
}

export async function listR2(prefix = ''): Promise<{ objects: { key: string }[], truncated: boolean }> {
  const keys: string[] = []
  collectR2Keys(R2_ROOT, '', keys)
  const objects = keys.filter(key => key.startsWith(prefix)).sort().map(key => ({ key }))
  return { objects, truncated: false }
}

export async function insertDomain(name: string, isDefault = false) {
  const now = Math.floor(Date.now() / 1000)
  await db.insert(domains).values({ name, isDefault, createdAt: now, updatedAt: now }).onConflictDoNothing()
  if (isDefault) {
    await db.update(domains).set({ isDefault: false }).where(ne(domains.name, name))
    await db.update(domains).set({ isDefault: true, updatedAt: now }).where(eq(domains.name, name))
  }
  await deleteKV('domain:list')
}

export async function deleteDomain(name: string) {
  await db.delete(domains).where(eq(domains.name, name))
  await deleteKV('domain:list')
}

export async function clearDomains() {
  await db.delete(domains)
  await deleteKV('domain:list')
}

export async function clearLinks() {
  await db.delete(linkTags)
  await db.delete(links)
  await db.delete(linkTombstones)
}

export async function getStoredLink(slug: string, domain = ''): Promise<Link | null> {
  return await getKV<Link>(linkCacheKey(domain, slug), { type: 'json' })
}

export async function getD1Link(slug: string, domain = '') {
  const [link] = await db.select().from(links).where(and(eq(links.domain, domain), eq(links.slug, slug))).limit(1)
  return link ?? null
}

export async function deleteStoredLink(slug: string, domain = '') {
  await Promise.all([
    deleteKV(linkCacheKey(domain, slug)),
    db.delete(links).where(and(eq(links.domain, domain), eq(links.slug, slug))),
    db.delete(linkTombstones).where(and(eq(linkTombstones.domain, domain), eq(linkTombstones.slug, slug))),
  ])
}

export async function deleteStoredLinks(slugs: string[]) {
  await Promise.all(slugs.map(slug => deleteStoredLink(slug)))
}

export async function clearApiKeys() {
  await db.delete(apiKeys)
}

export async function clearLinkMigrationState() {
  await db.delete(linkMigrationRuns)
}

export async function setLinkStoreD1Mode() {
  await clearLinkMigrationState()
  const now = Math.floor(Date.now() / 1000)
  await db.insert(linkMigrationRuns).values({
    id: `test-completed-${randomUUID()}`,
    expectedCursor: null,
    scanned: 0,
    inserted: 0,
    skipped: 0,
    expired: 0,
    force: false,
    status: 'completed',
    createdAt: now,
    updatedAt: now,
  })
}

export function expectMaskedPassword(password: string | undefined, plainText: string) {
  expect(password).toBeDefined()
  expect(password?.startsWith(LINK_PASSWORD_MASK_PREFIX), password).toBe(true)
  expect(password).toContain(plainText.slice(-3))
  expect(password).not.toBe(plainText)
  expect(password?.startsWith(LINK_PASSWORD_HASH_PREFIX)).toBe(false)
}

export async function expectStoredHashedPassword(slug: string, plainText: string) {
  const storedLink = await getStoredLink(slug)
  expect(storedLink?.password?.startsWith(LINK_PASSWORD_HASH_PREFIX), storedLink?.password).toBe(true)
  expect(storedLink?.password).not.toBe(plainText)
}

// 1x1 transparent PNG for testing
export const TEST_PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4E,
  0x47,
  0x0D,
  0x0A,
  0x1A,
  0x0A,
  0x00,
  0x00,
  0x00,
  0x0D,
  0x49,
  0x48,
  0x44,
  0x52,
  0x00,
  0x00,
  0x00,
  0x01,
  0x00,
  0x00,
  0x00,
  0x01,
  0x08,
  0x06,
  0x00,
  0x00,
  0x00,
  0x1F,
  0x15,
  0xC4,
  0x89,
  0x00,
  0x00,
  0x00,
  0x0A,
  0x49,
  0x44,
  0x41,
  0x54,
  0x78,
  0x9C,
  0x63,
  0x00,
  0x01,
  0x00,
  0x00,
  0x05,
  0x00,
  0x01,
  0x0D,
  0x0A,
  0x2D,
  0xB4,
  0x00,
  0x00,
  0x00,
  0x00,
  0x49,
  0x45,
  0x4E,
  0x44,
  0xAE,
  0x42,
  0x60,
  0x82,
])
