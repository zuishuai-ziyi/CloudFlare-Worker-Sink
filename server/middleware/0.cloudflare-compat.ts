import type { H3Event } from 'h3'
import { getRequestHeaders, getRequestURL } from 'h3'

// Injects the Cloudflare-shaped request context for the Node runtime. Filename
// ordering (`0.`) guarantees this runs before the redirect/auth middleware.

export default eventHandler(async (event) => {
  // Real Cloudflare runtimes (and existing tests) already provide this context.
  if (event.context.cloudflare)
    return

  const runtimeConfig = useRuntimeConfig(event)
  const env = await usePlatformEnv({
    dataDir: runtimeConfig.dataDir,
    aiBaseUrl: runtimeConfig.aiBaseUrl,
    aiApiKey: runtimeConfig.aiApiKey,
  })

  event.context.cloudflare = {
    request: await buildWebRequest(event, resolveGeoipDbPath(runtimeConfig)),
    env: env as unknown as Cloudflare.Env,
    context: createExecutionContext(),
  }
})

async function buildWebRequest(event: H3Event, geoipDb: string): Promise<Request<unknown, IncomingRequestCfProperties>> {
  const headers = new Headers()
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (value === undefined)
      continue
    try {
      headers.set(key, value)
    }
    catch {
      // Skip headers rejected by the Fetch implementation (e.g. connection/host).
    }
  }

  const request = new Request(getRequestURL(event).toString(), {
    method: event.method,
    headers,
  }) as Request<unknown, IncomingRequestCfProperties>

  const cf = await resolveCfProperties(event, geoipDb)
  return Object.defineProperty(request, 'cf', {
    value: cf,
    enumerable: true,
    configurable: true,
  }) as Request<unknown, IncomingRequestCfProperties>
}

function createExecutionContext(): ExecutionContext {
  return {
    waitUntil(promise: Promise<unknown>) {
      Promise.resolve(promise).catch((error) => {
        console.error('[platform:waitUntil]', error)
      })
    },
    passThroughOnException() {},
    props: {},
  } as unknown as ExecutionContext
}
