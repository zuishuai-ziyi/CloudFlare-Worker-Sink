import { DomainSchema } from '#shared/schemas/domain'
import { setDefaultDomain } from '../../services/domain-store'

defineRouteMeta({
  openAPI: {
    description: 'Set a registered domain as the default. Links using the default domain resolve on it and on any unregistered host.',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'name',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'The domain to set as default',
      },
    ],
  },
})

export default eventHandler(async (event) => {
  const { name } = getRouterParams(event)
  const parsed = DomainSchema.parse(name)
  const updated = await setDefaultDomain(event, parsed)
  if (!updated) {
    throw createError({
      status: 404,
      statusText: 'Domain not found',
    })
  }
  return { name: parsed, isDefault: true }
})
