import { listDomains } from '../services/domain-store'

defineRouteMeta({
  openAPI: {
    description: 'List registered domains with per-domain link counts',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  return await listDomains(event)
})
