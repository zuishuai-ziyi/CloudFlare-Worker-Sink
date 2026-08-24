import { CreateApiKeySchema } from '#shared/schemas/api-key'

defineRouteMeta({
  openAPI: {
    description: 'Create an API key',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name', 'scopes'],
            properties: {
              name: { type: 'string', description: 'Human-friendly label for the API key' },
              scopes: {
                type: 'array',
                items: { type: 'string', enum: ['links:read', 'links:write'] },
                description: 'Scopes granted to the key; defaults to both read and write',
              },
              expiresAt: { type: 'integer', description: 'Optional unix-seconds expiration timestamp' },
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
      statusText: 'Preview mode cannot create API keys.',
    })
  }

  const input = await readValidatedBody(event, CreateApiKeySchema.parse)
  const result = await createApiKeyRecord(event, input)
  setResponseStatus(event, 201)
  return result
})
