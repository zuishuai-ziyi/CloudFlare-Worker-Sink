import { queryCounters } from '#server/utils/analytics'
import { QuerySchema } from '#shared/schemas/query'

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse)
  return queryCounters(event, query)
})
