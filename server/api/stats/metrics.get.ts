import { z } from 'zod'
import { blobsMap, doublesMap } from '#server/utils/access-log'
import { queryMetrics } from '#server/utils/analytics'
import { QuerySchema } from '#shared/schemas/query'

type MetricType = (typeof blobsMap)[keyof typeof blobsMap] | (typeof doublesMap)[keyof typeof doublesMap]
const validMetricTypes = [...Object.values(blobsMap), ...Object.values(doublesMap)] as [MetricType, ...MetricType[]]

const MetricsQuerySchema = QuerySchema.extend({
  type: z.enum(validMetricTypes),
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, MetricsQuerySchema.parse)
  return queryMetrics(event, query, query.type)
})
