import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Query } from '#shared/schemas/query'
import { and, gte, inArray, lte } from 'drizzle-orm'
import { accessLogs } from '../database/schema'

export type { Query }

function queryValues(value: string, omitEmpty = false): string[] {
  if ([...value].some((character) => {
    const code = character.charCodeAt(0)
    return code <= 0x1F || code === 0x7F
  })) {
    throw new Error('Analytics filters must not contain control characters')
  }

  const values = value.split(',')
  return omitEmpty ? values.filter(Boolean) : values
}

// Query fields that map to a filterable access-log column. Fields absent from
// QuerySchema (`ua`, `ip`, `COLO`) stay unfilterable, matching the previous
// Analytics Engine behaviour.
const filterColumns: Record<string, SQLiteColumn> = {
  url: accessLogs.url,
  slug: accessLogs.slug,
  domain: accessLogs.domain,
  referer: accessLogs.referer,
  country: accessLogs.country,
  region: accessLogs.region,
  city: accessLogs.city,
  timezone: accessLogs.timezone,
  language: accessLogs.language,
  os: accessLogs.os,
  browser: accessLogs.browser,
  browserType: accessLogs.browserType,
  device: accessLogs.device,
  deviceType: accessLogs.deviceType,
}

/**
 * Translates a validated query into a Drizzle `where` condition. `startAt` and
 * `endAt` are second-precision epochs (as sent by the dashboard); stored
 * timestamps are milliseconds, so ranges are expanded back to the whole second.
 */
export function buildAnalyticsFilter(query: Query): SQL | undefined {
  const filters: SQL[] = []

  if (query.id) {
    const ids = queryValues(query.id, true)
    if (ids.length)
      filters.push(inArray(accessLogs.linkId, ids))
  }

  for (const [key, column] of Object.entries(filterColumns)) {
    const value = query[key as keyof Query]
    if (typeof value === 'string' && value)
      filters.push(inArray(column, queryValues(value)))
  }

  if (query.startAt) {
    const startTimestamp = Math.floor(Number(query.startAt))
    filters.push(gte(accessLogs.timestamp, startTimestamp * 1000))
  }

  if (query.endAt) {
    const endTimestamp = Math.floor(Number(query.endAt))
    filters.push(lte(accessLogs.timestamp, endTimestamp * 1000 + 999))
  }

  return filters.length ? and(...filters) : undefined
}
