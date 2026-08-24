import { ApiKeyTargetSchema } from '#shared/schemas/api-key'

defineRouteMeta({
  openAPI: {
    description: 'Rotate an API key by minting a new secret and invalidating the previous one',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'API key id to rotate' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot rotate API keys.',
    })
  }

  const { id } = await readValidatedBody(event, ApiKeyTargetSchema.parse)
  const result = await rotateApiKeyRecord(event, id)
  if (!result) {
    throw createError({
      status: 404,
      statusText: 'API key not found',
    })
  }
  return result
})
