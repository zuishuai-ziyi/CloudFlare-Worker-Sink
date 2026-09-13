import type { Database as SqliteDatabase } from 'better-sqlite3'
import { Buffer } from 'node:buffer'

// Node replacement for the Cloudflare KV binding, persisted in the same SQLite
// database as D1. Reads and list results lazily purge expired keys; the local
// store has no edge cache, so `cacheTtl` options are accepted and ignored.

const KV_TABLE_DDL = `CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  metadata TEXT,
  expires_at INTEGER
)`

const DEFAULT_LIST_LIMIT = 1000

// Physical deletion of expired rows is throttled so redirect traffic does not
// run a DELETE on every read. Reads still exclude expired rows via their SELECT
// predicate, so correctness does not depend on the purge having run.
const PURGE_INTERVAL_MS = 60_000
let lastPurgeAt = 0

type KvValueType = 'text' | 'json' | 'arrayBuffer' | 'stream'

interface KvRow {
  key: string
  value: string | null
  metadata: string | null
  expires_at: number | null
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

async function streamToText(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      if (value)
        chunks.push(value)
    }
  }
  finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8')
}

async function toStoredString(value: unknown): Promise<string> {
  if (typeof value === 'string')
    return value
  if (value instanceof ArrayBuffer)
    return Buffer.from(value).toString('utf8')
  if (ArrayBuffer.isView(value))
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8')
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream)
    return await streamToText(value)
  if (value === null || value === undefined)
    return ''
  return String(value)
}

function resolveType(typeOrOptions?: unknown): KvValueType {
  if (typeof typeOrOptions === 'string')
    return typeOrOptions as KvValueType
  if (typeOrOptions && typeof typeOrOptions === 'object' && 'type' in typeOrOptions) {
    const type = (typeOrOptions as { type?: unknown }).type
    if (typeof type === 'string')
      return type as KvValueType
  }
  return 'text'
}

function decodeValue(value: string | null, type: KvValueType): unknown {
  if (value === null)
    return null
  if (type === 'json')
    return JSON.parse(value)
  if (type === 'arrayBuffer')
    return Buffer.from(value, 'utf8').buffer
  if (type === 'stream') {
    const bytes = Buffer.from(value, 'utf8')
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }
  return value
}

class NodeKvNamespace {
  constructor(private readonly database: SqliteDatabase) {
    database.exec(KV_TABLE_DDL)
  }

  private purgeExpired(force = false): void {
    const now = Date.now()
    if (!force && now - lastPurgeAt < PURGE_INTERVAL_MS)
      return
    lastPurgeAt = now
    this.database.prepare('DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at <= ?').run(nowSeconds())
  }

  private readRow(key: string): KvRow | null {
    this.purgeExpired()
    const row = this.database.prepare(
      'SELECT key, value, metadata, expires_at FROM kv_store WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)',
    ).get(key, nowSeconds()) as KvRow | undefined
    return row ?? null
  }

  async get(key: string, typeOrOptions?: unknown): Promise<unknown> {
    const row = this.readRow(key)
    return decodeValue(row?.value ?? null, resolveType(typeOrOptions))
  }

  async getWithMetadata(key: string, typeOrOptions?: unknown): Promise<{ value: unknown, metadata: unknown, cacheStatus: null }> {
    const row = this.readRow(key)
    return {
      value: decodeValue(row?.value ?? null, resolveType(typeOrOptions)),
      metadata: row?.metadata ? JSON.parse(row.metadata) : null,
      cacheStatus: null,
    }
  }

  async put(key: string, value: unknown, options?: { expiration?: number, expirationTtl?: number, metadata?: unknown }): Promise<void> {
    const stored = await toStoredString(value)
    const metadata = options?.metadata === undefined ? null : JSON.stringify(options.metadata)
    let expiresAt: number | null = null
    if (typeof options?.expiration === 'number')
      expiresAt = options.expiration
    else if (typeof options?.expirationTtl === 'number')
      expiresAt = nowSeconds() + options.expirationTtl

    this.database.prepare(`
      INSERT INTO kv_store (key, value, metadata, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, metadata = excluded.metadata, expires_at = excluded.expires_at
    `).run(key, stored, metadata, expiresAt)
  }

  async delete(key: string): Promise<void> {
    this.database.prepare('DELETE FROM kv_store WHERE key = ?').run(key)
  }

  async list(options?: { prefix?: string | null, limit?: number | null, cursor?: string | null }): Promise<KVNamespaceListResult<unknown>> {
    // List is low-frequency, so always purge before building a page.
    this.purgeExpired(true)
    const prefix = options?.prefix ?? ''
    const limit = options?.limit ?? DEFAULT_LIST_LIMIT
    const cursor = options?.cursor ?? null

    const rows = this.database.prepare(`
      SELECT key, metadata, expires_at FROM kv_store
      WHERE substr(key, 1, ?) = ? AND (? IS NULL OR key > ?)
      ORDER BY key ASC
      LIMIT ?
    `).all(prefix.length, prefix, cursor, cursor, limit + 1) as Array<{ key: string, metadata: string | null, expires_at: number | null }>

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const keys = page.map(row => ({
      name: row.key,
      ...(row.expires_at === null ? {} : { expiration: row.expires_at }),
      ...(row.metadata === null ? {} : { metadata: JSON.parse(row.metadata) }),
    }))

    const listComplete = !hasMore
    const last = page.at(-1)
    if (listComplete)
      return { list_complete: true, keys, cacheStatus: null }
    return { list_complete: false, keys, cursor: last?.key ?? '', cacheStatus: null }
  }
}

/** Wraps a better-sqlite3 connection as a KVNamespace-compatible binding. */
export function createKvNamespace(database: SqliteDatabase): KVNamespace {
  return new NodeKvNamespace(database) as unknown as KVNamespace
}
