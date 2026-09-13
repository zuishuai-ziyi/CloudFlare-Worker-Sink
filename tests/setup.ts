import { beforeAll } from 'vitest'
import { getTestServer, resetTestDataDir } from './server'

// The suite runs against a real Nitro server so redirects, headers, status
// codes, and R2-backed assets can be asserted over HTTP. The server owns the
// Cloudflare-to-Node platform emulation and applies the drizzle migrations on
// its first request. Resetting the data directory at module load (before test
// files import the direct DB helpers) keeps each run starting from an empty
// database.
resetTestDataDir()

beforeAll(async () => {
  await getTestServer()
})
