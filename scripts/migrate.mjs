#!/usr/bin/env node
// Standalone Node migration runner for the local SQLite platform.
// Mirrors the migration logic in server/utils/platform/db.ts so `pnpm db:migrate`
// can prepare a data directory without booting Nuxt.

import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'
import Database from 'better-sqlite3'

const MIGRATIONS_TABLE = 'd1_migrations'
const LOCAL_MIGRATION_ID = 'local-init'

const KV_TABLE_DDL = `CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  metadata TEXT,
  expires_at INTEGER
)`

const dataDir = resolve(process.env.NUXT_DATA_DIR || join(process.cwd(), 'data'))
const drizzleDir = join(process.cwd(), 'drizzle')

mkdirSync(dataDir, { recursive: true })

const database = new Database(join(dataDir, 'sink.db'))
database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')
database.pragma('busy_timeout = 5000')

database.exec(`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)

const applied = new Set(database.prepare(`SELECT name FROM ${MIGRATIONS_TABLE}`).all().map(row => row.name))
const markApplied = database.prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, applied_at) VALUES (?, ?)`)

const files = readdirSync(drizzleDir)
  .filter(name => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b))

console.info(`[migrate] Data directory: ${dataDir}`)
console.info(`[migrate] Drizzle migrations: ${drizzleDir}`)

/**
 * Executes one migration file's statements as a single transaction, mirroring
 * the server-side runner. `PRAGMA` statements are no-ops inside a transaction,
 * so each batch is committed before a pragma runs and pragmas execute outside a
 * transaction (table-rebuild migrations depend on `PRAGMA foreign_keys`).
 */
function applyMigrationStatements(statements) {
  let batch = []
  const flush = () => {
    if (batch.length === 0)
      return
    const runBatch = database.transaction(() => {
      for (const statement of batch)
        database.exec(statement)
    })
    runBatch()
    batch = []
  }

  for (const statement of statements) {
    if (/^\s*pragma\b/i.test(statement)) {
      flush()
      database.exec(statement)
    }
    else {
      batch.push(statement)
    }
  }
  flush()
}

for (const name of files) {
  if (applied.has(name)) {
    console.info(`[migrate] skip   ${name} (already applied)`)
    continue
  }

  const sql = readFileSync(join(drizzleDir, name), 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)

  applyMigrationStatements(statements)
  markApplied.run(name, new Date().toISOString())
  console.info(`[migrate] apply  ${name} (${statements.length} statements)`)
}

database.exec(KV_TABLE_DDL)

const completed = database.prepare(`SELECT 1 AS present FROM link_migration_runs WHERE status = 'completed' LIMIT 1`).get()
const pendingKvLink = database.prepare(`SELECT 1 AS present FROM kv_store WHERE key LIKE 'link:%' LIMIT 1`).get()

if (!completed && !pendingKvLink) {
  const now = Math.floor(Date.now() / 1000)
  database.prepare(`
    INSERT INTO link_migration_runs (
      id, expected_cursor, scanned, inserted, skipped, expired, force, status, created_at, updated_at
    ) VALUES (?, NULL, 0, 0, 0, 0, 0, 'completed', ?, ?)
  `).run(LOCAL_MIGRATION_ID, now, now)
  console.info('[migrate] Recorded completed local migration marker for a fresh install')
}

database.close()
console.info('[migrate] Done')
