import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { createAiBinding } from './ai'
import { createD1Database, preparePlatformDatabase } from './db'
import { createKvNamespace } from './kv'
import { createR2Bucket } from './r2'

// Assembles the Cloudflare-compatible environment (`DB`/`KV`/`R2`/`AI`) from
// local Node implementations so business code can keep reading
// `event.context.cloudflare.env` unchanged. ANALYTICS is intentionally not
// provided; access logs are persisted to the local `access_logs` table.

export interface PlatformConfig {
  dataDir?: string
  aiBaseUrl?: string
  aiApiKey?: string
}

export interface PlatformEnv {
  DB: D1Database
  KV: KVNamespace
  R2: R2Bucket
  AI?: Ai
}

let envPromise: Promise<PlatformEnv> | null = null

function readRuntimeConfig<T>(read: (config: ReturnType<typeof useRuntimeConfig>) => T): T | undefined {
  try {
    return read(useRuntimeConfig())
  }
  catch {
    return undefined
  }
}

function resolveDataDir(config?: PlatformConfig): string {
  return config?.dataDir
    || readRuntimeConfig(runtimeConfig => runtimeConfig.dataDir)
    || process.env.NUXT_DATA_DIR
    || resolve(process.cwd(), 'data')
}

function resolveAiConfig(config?: PlatformConfig): { baseUrl: string, apiKey: string } {
  const baseUrl = config?.aiBaseUrl || readRuntimeConfig(runtimeConfig => runtimeConfig.aiBaseUrl) || ''
  const apiKey = config?.aiApiKey || readRuntimeConfig(runtimeConfig => runtimeConfig.aiApiKey) || ''
  return { baseUrl, apiKey }
}

/**
 * Returns the lazily-initialized platform environment. Data directories are
 * created on first access and the singleton is cached for the process lifetime.
 */
export function usePlatformEnv(config?: PlatformConfig): Promise<PlatformEnv> {
  if (!envPromise) {
    envPromise = initializePlatformEnv(config).catch((error) => {
      // Never cache a rejected initialization; the next request retries.
      envPromise = null
      throw error
    })
  }
  return envPromise
}

async function initializePlatformEnv(config?: PlatformConfig): Promise<PlatformEnv> {
  const dataDir = resolveDataDir(config)
  await mkdir(dataDir, { recursive: true })

  const database = await preparePlatformDatabase(dataDir)
  const env: PlatformEnv = {
    DB: createD1Database(database),
    KV: createKvNamespace(database),
    R2: createR2Bucket(dataDir),
  }

  const ai = createAiBinding(resolveAiConfig(config))
  if (ai)
    env.AI = ai

  console.info(`[platform] Node platform environment ready (dataDir: ${dataDir})`)
  return env
}

/** Resolves the configured GeoIP database path, if any. */
export function resolveGeoipDbPath(config?: { geoipDb?: string }): string {
  return config?.geoipDb || readRuntimeConfig(runtimeConfig => runtimeConfig.geoipDb) || process.env.NUXT_GEOIP_DB || ''
}
