import { ApiKeyTargetSchema } from '#shared/schemas/api-key'

defineRouteMeta({
  openAPI: {
    description: 'Revoke an API key without deleting it',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'API key id to revoke' },
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
      statusText: 'Preview mode cannot revoke API keys.',
    })
  }

  const { id } = await readValidatedBody(event, ApiKeyTargetSchema.parse)
  const revoked = await revokeApiKeyRecord(event, id)
  if (!revoked) {
    throw createError({
      status: 404,
      statusText: 'API key not found',
    })
  }
  return {}
})
