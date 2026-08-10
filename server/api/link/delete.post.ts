import { z } from 'zod'
import { StoredDomainSchema } from '#shared/schemas/domain'
import { SlugSchema } from '#shared/schemas/link'
import { getDefaultDomain } from '../../services/domain-store'
import { canonicalizeDomain } from '../../utils/domain'

defineRouteMeta({
  openAPI: {
    description: 'Delete a short link',
    security: [{ bearerAuth: [] }],
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['slug', 'domain'],
            properties: {
              slug: { type: 'string', description: 'The slug of the link to delete' },
              domain: { type: 'string', description: 'The domain of the link to delete' },
            },
          },
        },
      },
    },
  },
})

const DeleteSchema = z.object({
  slug: SlugSchema.min(1),
  domain: StoredDomainSchema,
})

export default eventHandler(async (event) => {
  const { previewMode } = useRuntimeConfig(event).public
  if (previewMode) {
    throw createError({
      status: 403,
      statusText: 'Preview mode cannot delete links.',
    })
  }

  const body = await readValidatedBody(event, DeleteSchema.parse)
  const slug = normalizeSlug(event, body.slug)
  const defaultDomain = await getDefaultDomain(event)
  await deleteLink(event, canonicalizeDomain(body.domain, defaultDomain), slug)
})
