import { z } from 'zod'
import { StoredDomainSchema } from '#shared/schemas/domain'
import { getDefaultDomain } from '../../services/domain-store'
import { canonicalizeDomain } from '../../utils/domain'

defineRouteMeta({
  openAPI: {
    description: 'Query a short link by slug and domain',
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: 'slug',
        in: 'query',
        required: true,
        schema: { type: 'string' },
        description: 'The slug of the link to query',
      },
      {
        name: 'domain',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'The domain of the link (defaults to the default domain)',
      },
    ],
  },
})

const QueryParamsSchema = z.object({
  slug: z.string().trim().min(1).max(2048),
  domain: StoredDomainSchema.default(''),
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QueryParamsSchema.parse)
  const slug = normalizeSlug(event, query.slug)
  const defaultDomain = await getDefaultDomain(event)
  const domain = canonicalizeDomain(query.domain, defaultDomain)

  const { link, metadata } = await getLinkWithMetadata(event, domain, slug)
  if (link) {
    return sanitizeLinkPassword({
      ...metadata,
      ...link,
    })
  }

  throw createError({
    status: 404,
    statusText: 'Not Found',
  })
})
