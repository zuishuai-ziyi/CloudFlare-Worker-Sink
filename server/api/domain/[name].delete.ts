import { DomainSchema } from '#shared/schemas/domain'
import { deleteDomain } from '../../services/domain-store'

defineRouteMeta({
  openAPI: {
    description: 'Delete a registered domain. The default domain and domains with links cannot be deleted.',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'name',
        in: 'path',
        required: true,
        schema: { type: 'string' },
        description: 'The domain to delete',
      },
    ],
  },
})

export default eventHandler(async (event) => {
  const { name } = getRouterParams(event)
  const parsed = DomainSchema.parse(name)
  const result = await deleteDomain(event, parsed)

  if (!result.deleted) {
    if (result.reason === 'not-found') {
      throw createError({ status: 404, statusText: 'Domain not found' })
    }
    if (result.reason === 'default') {
      throw createError({ status: 409, statusText: 'Cannot delete the default domain. Set another default first.' })
    }
    if (result.reason === 'has-links') {
      throw createError({
        status: 409,
        statusText: `Cannot delete a domain that is in use. Move or delete its ${result.linkCount} link(s) first.`,
      })
    }
  }

  return { deleted: true }
})
