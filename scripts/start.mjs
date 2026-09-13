#!/usr/bin/env node
// Production launcher for the built Nitro server. It loads the repository-root
// `.env` before importing `.output/server/index.mjs` so runtime overrides such
// as `PORT`, `NUXT_SITE_TOKEN`, or `NUXT_DATA_DIR` written after `pnpm build`
// take effect. Values already present in `process.env` win: `loadEnvFile` never
// overwrites existing variables, so an explicit environment (systemd
// `Environment=`, a shell export, ...) still takes precedence over the file.

import process from 'node:process'

const envFile = new URL('../.env', import.meta.url)

try {
  process.loadEnvFile(envFile)
}
catch (error) {
  // A missing `.env` is expected on fresh installs; keep every value from the
  // ambient environment and the built-in defaults instead of failing to boot.
  if (error?.code !== 'ENOENT')
    throw error
}

await import(new URL('../.output/server/index.mjs', import.meta.url))
