import type { Database as SqliteDatabase, Statement } from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'
import { registerAnalyticsFunctions } from './analytics-functions'

// Node replacement for the Cloudflare D1 binding. It keeps the exact call surface
// drizzle-orm/d1 relies on (prepare/bind/run/all/raw/batch) so the existing SQLite
// schema and drizzle migrations can be reused unchanged.

const MIGRATIONS_TABLE = 'd1_migrations'
const LOCAL_MIGRATION_ID = 'local-init'

/**
 * Extra indexes/DDL needed by the platform shims themselves. These are not part
 * of the drizzle schema because they only describe the local KV emulation.
 */
const KV_TABLE_DDL = `CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  metadata TEXT,
  expires_at INTEGER
)`

let sqlite: SqliteDatabase | null = null
let sqliteDir: string | null = null

/** Opens (once) the shared better-sqlite3 connection for a data directory. */
export function openPlatformDatabase(dataDir: string): SqliteDatabase {
  if (sqlite && sqliteDir === dataDir)
    return sqlite

  if (sqlite)
    sqlite.close()

  mkdirSync(dataDir, { recursive: true })
  const database = new Database(join(dataDir, 'sink.db'))
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  registerAnalyticsFunctions(database)
  sqlite = database
  sqliteDir = dataDir
  return database
}

interface MigrationFile {
  name: string
  sql: string
}

function coerceSqlContent(value: unknown): string | null {
  if (typeof value === 'string')
    return value
  if (value instanceof Uint8Array)
    return Buffer.from(value).toString('utf8')
  if (value instanceof ArrayBuffer)
    return Buffer.from(value).toString('utf8')
  return null
}

/**
 * Loads the drizzle migration files. Server assets are the primary source (works
 * in both dev and the built server), with a plain fs fallback next to cwd.
 */
async function readMigrationFiles(): Promise<MigrationFile[]> {
  const files = new Map<string, string>()

  try {
    const storage = useStorage('assets:drizzle')
    const keys = await storage.getKeys()
    for (const key of keys) {
      const name = key.split('/').pop()
      if (!name || !name.endsWith('.sql'))
        continue
      const content = coerceSqlContent(await storage.getItem(key))
      if (content !== null)
        files.set(name, content)
    }
  }
  catch (error) {
    console.warn('[platform:db] Unable to read drizzle assets, falling back to fs:', error)
  }

  if (files.size === 0) {
    try {
      const dir = join(process.cwd(), 'drizzle')
      const entries = await readdir(dir)
      for (const name of entries) {
        if (!name.endsWith('.sql'))
          continue
        files.set(name, await readFile(join(dir, name), 'utf8'))
      }
    }
    catch (error) {
      console.warn('[platform:db] Unable to read drizzle migrations from fs:', error)
    }
  }

  return [...files.entries()]
    .map(([name, sql]) => ({ name, sql }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Splits a drizzle migration file on its statement separator. */
export function splitMigrationStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)
}

/** Applies pending drizzle migrations, tracked in `d1_migrations`. */
export async function applyPlatformMigrations(db: SqliteDatabase): Promise<void> {
  db.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)

  const appliedRows = db.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all() as { name: string }[]
  const applied = new Set(appliedRows.map(row => row.name))
  const files = await readMigrationFiles()
  const markApplied = db.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`)

  for (const file of files) {
    if (applied.has(file.name)) {
      console.info(`[platform:db] Migration ${file.name} already applied`)
      continue
    }

    // The file runs as one transaction, so a failure rolls every statement back
    // and the `d1_migrations` row below is never written.
    applyMigrationStatements(db, splitMigrationStatements(file.sql))
    markApplied.run(file.name, new Date().toISOString())
    console.info(`[platform:db] Applied migration ${file.name}`)
  }
}

/**
 * Executes one migration file's statements as a single transaction. `PRAGMA`
 * statements (notably `PRAGMA foreign_keys`, used by table-rebuild migrations)
 * are no-ops inside a transaction, so the current batch is committed first and
 * each pragma runs outside a transaction to actually take effect.
 */
function applyMigrationStatements(db: SqliteDatabase, statements: string[]): void {
  let batch: string[] = []
  const flush = () => {
    if (batch.length === 0)
      return
    const runBatch = db.transaction(() => {
      for (const statement of batch)
        db.exec(statement)
    })
    runBatch()
    batch = []
  }

  for (const statement of statements) {
    if (/^\s*pragma\b/i.test(statement)) {
      flush()
      db.exec(statement)
    }
    else {
      batch.push(statement)
    }
  }
  flush()
}

/**
 * Fresh local installs have an empty D1 and no KV links, so the KV-to-D1 gate
 * would block every link request. Record a completed (no-op) migration run.
 */
export function ensureLocalMigrationMarker(db: SqliteDatabase): void {
  db.exec(KV_TABLE_DDL)

  const completed = db.prepare(`SELECT 1 AS present FROM link_migration_runs WHERE status = 'completed' LIMIT 1`).get()
  if (completed)
    return

  const pendingKvLink = db.prepare(`SELECT 1 AS present FROM kv_store WHERE key LIKE 'link:%' LIMIT 1`).get()
  if (pendingKvLink)
    return

  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO link_migration_runs (
      id, expected_cursor, scanned, inserted, skipped, expired, force, status, created_at, updated_at
    ) VALUES (?, NULL, 0, 0, 0, 0, 0, 'completed', ?, ?)
  `).run(LOCAL_MIGRATION_ID, now, now)
  console.info('[platform:db] Recorded completed local migration marker for a fresh install')
}

/** Ensures the database is migrated and ready for the D1 shim. */
export async function preparePlatformDatabase(dataDir: string): Promise<SqliteDatabase> {
  const db = openPlatformDatabase(dataDir)
  await applyPlatformMigrations(db)
  ensureLocalMigrationMarker(db)
  return db
}

function isWriteSql(sql: string): boolean {
  return /^\s*(?:insert|update|delete|replace)\b/i.test(sql)
}

interface SqliteRunInfo {
  changes: number
  lastInsertRowid: number | bigint
}

/**
 * Minimal D1Database implementation backed by better-sqlite3. `batch` runs all
 * statements sequentially inside a single SQLite transaction.
 */
class NodeD1PreparedStatement {
  private readonly database: SqliteDatabase
  private readonly source: string
  private readonly params: unknown[]

  constructor(database: SqliteDatabase, source: string, params: unknown[] = []) {
    this.database = database
    this.source = source
    this.params = params
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new NodeD1PreparedStatement(this.database, this.source, values) as unknown as D1PreparedStatement
  }

  async first<T = unknown>(colName?: string): Promise<T | null> {
    return Promise.resolve(this.firstSync(colName) as T | null)
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(this.executeSync() as D1Result<T>)
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve(this.executeSync() as D1Result<T>)
  }

  async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    const prepared = this.prepareStatement()
    if (!prepared.reader) {
      prepared.run()
      return [] as unknown as T[]
    }
    const rows = prepared.raw().all() as unknown as T[]
    if (options?.columnNames) {
      const columns = prepared.columns().map(column => column.name)
      return [columns, ...rows] as [string[], ...T[]]
    }
    return rows
  }

  private prepareStatement(): Statement {
    const statement = this.database.prepare(this.source)
    if (this.params.length > 0)
      statement.bind(...this.params)
    return statement
  }

  private firstSync(colName?: string): unknown {
    const result = this.executeSync()
    const row = result.results[0]
    if (row === undefined)
      return null
    if (colName !== undefined)
      return (row as Record<string, unknown>)[colName]
    return row
  }

  /** Synchronous execution shared by `run`/`all`/`first` and `batch`. */
  executeSync(): D1Result {
    const startedAt = Date.now()
    const statement = this.prepareStatement()
    let rows: Record<string, unknown>[] = []
    let changes = 0
    let lastRowId = 0

    if (statement.reader) {
      rows = statement.all() as Record<string, unknown>[]
      if (isWriteSql(this.source)) {
        changes = this.readChanges()
        lastRowId = this.readLastRowId()
      }
    }
    else {
      const info = statement.run() as SqliteRunInfo
      changes = info.changes
      lastRowId = Number(info.lastInsertRowid)
    }

    const duration = Date.now() - startedAt
    return {
      success: true,
      results: rows,
      meta: {
        duration,
        size_after: 0,
        rows_read: 0,
        rows_written: changes,
        last_row_id: lastRowId,
        changed_db: changes > 0,
        changes,
      },
    }
  }

  private readChanges(): number {
    const row = this.database.prepare('SELECT changes() AS changes').get() as { changes: number } | undefined
    return row?.changes ?? 0
  }

  private readLastRowId(): number {
    const row = this.database.prepare('SELECT last_insert_rowid() AS id').get() as { id: number | bigint } | undefined
    return Number(row?.id ?? 0)
  }
}

class NodeD1Database {
  constructor(private readonly database: SqliteDatabase) {}

  prepare(query: string): D1PreparedStatement {
    return new NodeD1PreparedStatement(this.database, query) as unknown as D1PreparedStatement
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    const results: D1Result[] = []
    const runBatch = this.database.transaction(() => {
      for (const statement of statements)
        results.push((statement as unknown as NodeD1PreparedStatement).executeSync())
    })
    runBatch()
    return results as D1Result<T>[]
  }

  async exec(query: string): Promise<D1ExecResult> {
    const startedAt = Date.now()
    this.database.exec(query)
    return { count: 1, duration: Date.now() - startedAt }
  }

  withSession(): D1DatabaseSession {
    return {
      prepare: (query: string) => this.prepare(query),
      batch: (statements: D1PreparedStatement[]) => this.batch(statements),
      getBookmark: () => null,
    } as D1DatabaseSession
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('D1 dump() is not supported by the Node platform shim')
  }
}

/** Wraps a better-sqlite3 connection as a D1Database-compatible binding. */
export function createD1Database(database: SqliteDatabase): D1Database {
  return new NodeD1Database(database) as unknown as D1Database
}
