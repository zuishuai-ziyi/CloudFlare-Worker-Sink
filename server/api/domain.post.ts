import { CreateDomainSchema } from '#shared/schemas/domain'
import { createDomain } from '../services/domain-store'

defineRouteMeta({
  openAPI: {
    description: 'Register a new domain. The first registered domain automatically becomes the default.',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Host routed to this project, e.g. sink.cool' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const { name } = await readValidatedBody(event, CreateDomainSchema.parse)
  const result = await createDomain(event, name)
  if (!result.created) {
    throw createError({
      status: 409,
      statusText: 'Domain already exists',
    })
  }
  setResponseStatus(event, 201)
  return { name, isDefault: result.isDefault }
})
