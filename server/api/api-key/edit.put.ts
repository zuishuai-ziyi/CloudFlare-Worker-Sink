import { EditApiKeySchema } from '#shared/schemas/api-key'

defineRouteMeta({
  openAPI: {
    description: 'Edit an API key',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: 'API key id to edit' },
              name: { type: 'string', description: 'Updated human-friendly label' },
              scopes: {
                type: 'array',
                items: { type: 'string', enum: ['links:read', 'links:write'] },
                description: 'Updated scopes; replaces the previous set',
              },
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
      statusText: 'Preview mode cannot edit API keys.',
    })
  }

  const input = await readValidatedBody(event, EditApiKeySchema.parse)
  const key = await updateApiKeyRecord(event, input)
  if (!key) {
    throw createError({
      status: 404,
      statusText: 'API key not found',
    })
  }
  return { key }
})
