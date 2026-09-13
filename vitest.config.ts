import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { configDefaults, defineConfig } from 'vitest/config'

interface HandledValidationError {
  statusCode: 400
  statusMessage: 'Validation Error'
  data: {
    issues: unknown[]
    name: 'ZodError'
    stack: string
  }
}

function isHandledValidationError(error: unknown): error is HandledValidationError {
  if (typeof error !== 'object' || error === null
    || !('statusCode' in error) || error.statusCode !== 400
    || !('statusMessage' in error) || error.statusMessage !== 'Validation Error'
    || !('data' in error) || typeof error.data !== 'object' || error.data === null) {
    return false
  }

  const { data } = error
  return 'issues' in data && Array.isArray(data.issues)
    && 'name' in data && data.name === 'ZodError'
    && 'stack' in data && typeof data.stack === 'string'
    && data.stack.includes('validateData')
}

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ mode }) => ({
  resolve: {
    // The Nuxt app resolves these aliases at build time. Tests import app and
    // server sources directly, so Vitest needs the same mapping.
    alias: {
      '#shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '#server': fileURLToPath(new URL('./server', import.meta.url)),
      // Nuxt's auto-import module is virtual at runtime. Unit tests that need
      // it replace it with `vi.mock('#imports', ...)`; the stub keeps the
      // specifier resolvable for the rest of the module graph.
      '#imports': fileURLToPath(new URL('./tests/stubs/imports.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./app', import.meta.url)),
      '~': fileURLToPath(new URL('./app', import.meta.url)),
      '~~': root,
      '@@': root,
    },
  },
  test: {
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
    exclude: [...configDefaults.exclude, 'cloudflare/**', 'docs/**'],
    isolate: false,
    maxWorkers: 1,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10_000,
    onUnhandledError(error) {
      return !isHandledValidationError(error)
    },
  },
}))
