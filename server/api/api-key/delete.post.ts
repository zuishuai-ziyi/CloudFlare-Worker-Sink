import { ApiKeyTargetSchema } from '#shared/schemas/api-key'

defineRouteMeta({
  openAPI: {
    description: 'Permanently delete an API key',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'API key id to delete' },
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
      statusText: 'Preview mode cannot delete API keys.',
    })
  }

  const { id } = await readValidatedBody(event, ApiKeyTargetSchema.parse)
  const deleted = await deleteApiKeyRecord(event, id)
  if (!deleted) {
    throw createError({
      status: 404,
      statusText: 'API key not found',
    })
  }
  return {}
})
