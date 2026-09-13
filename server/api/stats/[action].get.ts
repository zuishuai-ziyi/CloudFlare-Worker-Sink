import type { AccessExportRow } from '#server/utils/analytics'
import { z } from 'zod'
import { queryExport } from '#server/utils/analytics'
import { QuerySchema } from '#shared/schemas/query'
import { generateCsv } from '#shared/utils/csv'
import { createExportFilename } from '#shared/utils/export-file'

const CsvColumns = ['slug', 'url', 'viewer', 'views', 'referer'] as const

const StatsExportQuerySchema = QuerySchema.superRefine((query, ctx) => {
  if (query.startAt !== undefined && query.endAt !== undefined && query.startAt > query.endAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startAt must be less than or equal to endAt',
      path: ['startAt'],
    })
  }
})

function toCsv(rows: AccessExportRow[]): string {
  return generateCsv([...CsvColumns], rows.map(row => CsvColumns.map(column => row[column])))
}

export default eventHandler(async (event) => {
  if (getRouterParam(event, 'action') !== 'export') {
    throw createError({ status: 404, statusText: 'Not Found' })
  }

  const query = await getValidatedQuery(event, StatsExportQuerySchema.parse)
  const result = await queryExport(event, query)
  const csv = toCsv(result.data)

  setResponseHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setResponseHeader(event, 'Content-Disposition', `attachment; filename="${createExportFilename('sink-access', 'csv')}"`)
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return csv
})
