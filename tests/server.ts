import type { ChildProcess } from 'node:child_process'
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import process from 'node:process'

// Starts one real Nitro server (`.output/server/index.mjs`) for the whole test
// run and exposes its port/token so `tests/utils.ts` can talk to it over HTTP.
// The Cloudflare bindings are emulated by the Node platform layer inside that
// process; tests reach the same SQLite/R2 files directly where they need to
// seed or inspect state.

export interface TestServerContext {
  port: number
  baseUrl: string
  token: string
  dataDir: string
}

interface TestServerState {
  promise: Promise<TestServerContext> | null
  child: ChildProcess | null
  reset: boolean
  cleanupRegistered: boolean
  teardown: (() => void)[]
}

const SERVER_ENTRY = resolve(process.cwd(), '.output/server/index.mjs')
const DATA_DIR = resolve(process.cwd(), '.data', `test-${process.pid}`)
const READY_TIMEOUT_MS = 30_000

// State lives on `globalThis` so a re-imported setup module cannot spawn a
// second server or wipe the database out from under a running one.
function state(): TestServerState {
  const holder = globalThis as unknown as { __sinkTestServerState?: TestServerState }
  holder.__sinkTestServerState ??= { promise: null, child: null, reset: false, cleanupRegistered: false, teardown: [] }
  return holder.__sinkTestServerState
}

/**
 * Registers a synchronous cleanup (for example closing the direct SQLite
 * connection) that must run before the temporary data directory is removed.
 */
export function onTestServerStop(callback: () => void): void {
  state().teardown.push(callback)
}

/** Deterministic data directory shared by the server and the direct DB helpers. */
export function testDataDir(): string {
  return DATA_DIR
}

/**
 * Recreates the temporary data directory once per worker. Stale directories
 * from previous runs are swept too: Vitest force-terminates its workers, so the
 * exit-handler teardown below cannot always remove them.
 */
export function resetTestDataDir(): void {
  const current = state()
  if (current.reset)
    return
  current.reset = true
  const dataRoot = resolve(process.cwd(), '.data')
  try {
    for (const entry of readdirSync(dataRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('test-'))
        rmSync(resolve(dataRoot, entry.name), { recursive: true, force: true })
    }
  }
  catch {
    // The root may not exist yet.
  }
  mkdirSync(DATA_DIR, { recursive: true })
}

/** Idempotently starts the shared Nitro server and waits until it accepts requests. */
export function getTestServer(): Promise<TestServerContext> {
  const current = state()
  current.promise ??= startTestServer()
  return current.promise
}

async function startTestServer(): Promise<TestServerContext> {
  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`Missing ${SERVER_ENTRY}. Run \`pnpm build\` before running the tests.`)
  }

  mkdirSync(DATA_DIR, { recursive: true })

  const token = process.env.NUXT_SITE_TOKEN || randomBytes(32).toString('base64url')
  const port = await getFreePort()

  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      // Both processes must agree on the token: inject it explicitly instead of
      // relying on the server reading .env on its own.
      NUXT_SITE_TOKEN: token,
      NUXT_DATA_DIR: DATA_DIR,
      // A closed AI endpoint makes the AI routes exercise their fallback path
      // deterministically without touching the network.
      NUXT_AI_BASE_URL: process.env.NUXT_AI_BASE_URL || 'http://127.0.0.1:1/v1',
      NUXT_AI_API_KEY: process.env.NUXT_AI_API_KEY || 'test-ai-key',
      NUXT_DISABLE_AUTO_BACKUP: 'true',
      NODE_ENV: 'production',
      PORT: String(port),
      HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  state().child = child

  const logs: string[] = []
  child.stdout?.on('data', chunk => logs.push(`[server] ${chunk}`))
  child.stderr?.on('data', chunk => logs.push(`[server:err] ${chunk}`))
  child.on('exit', (code, signal) => {
    if (code !== 0 && signal === null)
      console.error(`Test server exited early with code ${code}`)
  })

  registerCleanup()

  try {
    await waitForReady(port)
  }
  catch (error) {
    stopTestServer()
    throw new Error(`Test server did not become ready within ${READY_TIMEOUT_MS}ms.\n${logs.join('')}`, { cause: error })
  }

  process.env.TEST_SERVER_PORT = String(port)
  process.env.TEST_SERVER_TOKEN = token

  return { port, baseUrl: `http://127.0.0.1:${port}`, token, dataDir: DATA_DIR }
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolvePort, reject) => {
    const probe = createServer()
    probe.unref()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close()
        reject(new Error('Unable to allocate a test port'))
        return
      }
      const port = address.port
      probe.close(() => resolvePort(port))
    })
  })
}

function probeVerify(port: number): Promise<number> {
  return new Promise<number>((resolveProbe, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: '/api/verify',
      method: 'GET',
      headers: { host: 'example.com' },
    }, (response) => {
      response.resume()
      response.on('end', () => resolveProbe(response.statusCode ?? 0))
    })
    request.on('error', reject)
    request.setTimeout(2_000, () => request.destroy(new Error('probe timeout')))
    request.end()
  })
}

async function waitForReady(port: number): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      // No token: the auth middleware answers 401 as soon as the server listens.
      if (await probeVerify(port) === 401)
        return
    }
    catch (error) {
      lastError = error
    }
    await new Promise(wait => setTimeout(wait, 250))
  }
  throw lastError instanceof Error ? lastError : new Error('timeout')
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Kills the shared server and removes its temporary data directory. */
export function stopTestServer(): void {
  const current = state()
  const child = current.child
  current.child = null
  current.promise = null
  if (child && child.pid !== undefined && child.exitCode === null) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else
      child.kill('SIGKILL')
  }
  for (const teardown of current.teardown) {
    try {
      teardown()
    }
    catch {
      // Teardown is best effort.
    }
  }
  current.teardown = []
  // Windows can hold the SQLite WAL handle for a moment after the kill; retry a
  // few times so the temporary directory is actually removed.
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      rmSync(DATA_DIR, { recursive: true, force: true })
      return
    }
    catch {
      sleepSync(100)
    }
  }
}

function registerCleanup(): void {
  const current = state()
  if (current.cleanupRegistered)
    return
  current.cleanupRegistered = true
  process.once('exit', stopTestServer)
  process.once('SIGINT', () => {
    stopTestServer()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    stopTestServer()
    process.exit(143)
  })
}
