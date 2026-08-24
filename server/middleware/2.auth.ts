import { timingSafeEqual } from 'node:crypto'
import { API_KEY_TOKEN_PREFIX } from '#shared/schemas/api-key'
import { resolveOpenApiScopes, touchApiKeyUsage, verifyApiKey } from '../utils/api-key'

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/'))
    return

  const token = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '')
  if (await verifySiteToken(token, useRuntimeConfig(event).siteToken)) {
    event.context.authMethod = 'site-token'
    event.context.userID = 'root'
    event.context.userEmail = `root@${getRequestURL(event).hostname}`
    return
  }

  if (token?.startsWith(API_KEY_TOKEN_PREFIX)) {
    const apiKey = await verifyApiKey(event, token)
    if (!apiKey) {
      throw createError({
        status: 401,
        statusText: 'Unauthorized',
      })
    }

    const method = getMethod(event) ?? event.method
    const requiredScopes = resolveOpenApiScopes(event.path.split('?')[0] ?? event.path, method)
    if (requiredScopes === null) {
      throw createError({
        status: 403,
        statusText: 'Forbidden',
      })
    }

    if (!requiredScopes.every(scope => apiKey.scopes.includes(scope))) {
      throw createError({
        status: 403,
        statusText: 'Insufficient API key scope',
      })
    }

    const hostname = getRequestURL(event).hostname
    event.context.authMethod = 'api-key'
    event.context.userID = `api-key:${apiKey.id}`
    event.context.userEmail = `api-key:${apiKey.id}@${hostname}`
    event.context.apiKey = { id: apiKey.id, name: apiKey.name, scopes: apiKey.scopes }
    touchApiKeyUsage(event, apiKey)
    return
  }

  const accessIdentity = await verifyCloudflareAccess(event)
  if (accessIdentity) {
    if (isCloudflareAccessRequestAllowed(event)) {
      Object.assign(
        event.context,
        mapCloudflareAccessIdentity(accessIdentity, getRequestURL(event).hostname),
      )
      return
    }

    throw createError({
      status: 403,
      statusText: 'Forbidden',
    })
  }

  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  throw createError({
    status: 401,
    statusText: 'Unauthorized',
  })
})

async function verifySiteToken(provided: string | undefined, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided || '')),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}
