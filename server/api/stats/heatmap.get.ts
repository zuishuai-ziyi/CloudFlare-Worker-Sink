import { z } from 'zod'
import { queryHeatmap } from '#server/utils/analytics'
import { QuerySchema } from '#shared/schemas/query'

const HeatmapQuerySchema = QuerySchema.extend({
  clientTimezone: z.string()
    .regex(/^[\w+-]+(?:\/[\w+-]+)*$/)
    .max(64)
    .default('Etc/UTC'),
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, HeatmapQuerySchema.parse)
  return queryHeatmap(event, query)
})
