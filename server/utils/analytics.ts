import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { H3Event } from 'h3'
import type { Query } from '#shared/schemas/query'
import type { LogEvent } from '#shared/types/events'
import { and, count, countDistinct, desc, lt, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { accessLogs } from '../database/schema'
import { usePlatformEnv } from './platform'
import { buildAnalyticsFilter } from './query-filter'
import { getSafeTimezone } from './time'

// Local Analytics Engine replacement. Every endpoint that used to query the
// Cloudflare `sink` dataset now aggregates the `access_logs` table, keeping the
// exact result shape the dashboard already consumes.

function analyticsDb(event: H3Event) {
  return drizzle(event.context.cloudflare.env.DB)
}

// Maps metric/query names onto the access-log columns. `metricColumns` also
// covers the numeric latitude/longitude doubles and the uppercase `COLO` name.
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

const metricColumns: Record<string, SQLiteColumn> = {
  ...filterColumns,
  ua: accessLogs.ua,
  ip: accessLogs.ip,
  COLO: accessLogs.colo,
  latitude: accessLogs.latitude,
  longitude: accessLogs.longitude,
}

// `COUNT(DISTINCT referer)` counts the empty sentinel as one distinct value;
// subtracting it matches the previous weighted Analytics Engine expression.
function distinctReferers(): SQL<number> {
  return sql<number>`count(distinct case when ${accessLogs.referer} <> '' then ${accessLogs.referer} end)`
}

function toNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

export async function queryMetrics(
  event: H3Event,
  query: Query,
  type: string,
): Promise<{ data: { name: string, count: number }[] }> {
  const column = metricColumns[type]
  if (!column)
    return { data: [] }

  const filter = buildAnalyticsFilter(query)
  const total = count()
  const rows = await analyticsDb(event)
    .select({ name: column, count: total })
    .from(accessLogs)
    .where(filter)
    .groupBy(column)
    .orderBy(desc(total))
    .limit(Math.max(0, Math.floor(query.limit)))

  return {
    data: rows.map(row => ({
      name: toText(row.name),
      count: toNumber(row.count),
    })),
  }
}

interface CountersRow {
  id?: string
  visits: number
  visitors: number
  referers: number
}

export async function queryCounters(
  event: H3Event,
  query: Query,
): Promise<{ data: CountersRow[] }> {
  const db = analyticsDb(event)
  const filter = buildAnalyticsFilter(query)
  const visits = count()
  const visitors = countDistinct(accessLogs.ip)
  const referers = distinctReferers()

  if (query.id) {
    const rows = await db
      .select({ id: accessLogs.linkId, visits, visitors, referers })
      .from(accessLogs)
      .where(filter)
      .groupBy(accessLogs.linkId)

    return { data: rows.map(row => ({ ...row, visits: toNumber(row.visits), visitors: toNumber(row.visitors), referers: toNumber(row.referers) })) }
  }

  const rows = await db
    .select({ visits, visitors, referers })
    .from(accessLogs)
    .where(filter)

  return { data: rows.map(row => ({ visits: toNumber(row.visits), visitors: toNumber(row.visitors), referers: toNumber(row.referers) })) }
}

interface ViewsQuery extends Query {
  unit: 'minute' | 'hour' | 'day'
  clientTimezone: string
}

export async function queryViews(
  event: H3Event,
  query: ViewsQuery,
): Promise<{ data: { time: string, visits: number, visitors: number }[] }> {
  const filter = buildAnalyticsFilter(query)
  const timeZone = getSafeTimezone(query.clientTimezone)
  const bucket = sql<string>`analytics_bucket(${accessLogs.timestamp}, ${query.unit}, ${timeZone})`
  const rows = await analyticsDb(event)
    .select({
      time: bucket,
      visits: count(),
      visitors: countDistinct(accessLogs.ip),
    })
    .from(accessLogs)
    .where(filter)
    .groupBy(bucket)
    .orderBy(bucket)

  return {
    data: rows.map(row => ({
      time: toText(row.time),
      visits: toNumber(row.visits),
      visitors: toNumber(row.visitors),
    })),
  }
}

interface HeatmapQuery extends Query {
  clientTimezone: string
}

export async function queryHeatmap(
  event: H3Event,
  query: HeatmapQuery,
): Promise<{ data: { weekday: number, hour: number, visits: number, visitors: number }[] }> {
  const filter = buildAnalyticsFilter(query)
  const timeZone = getSafeTimezone(query.clientTimezone)
  const weekday = sql<number>`analytics_weekday(${accessLogs.timestamp}, ${timeZone})`
  const hour = sql<number>`analytics_hour(${accessLogs.timestamp}, ${timeZone})`
  const rows = await analyticsDb(event)
    .select({
      weekday,
      hour,
      visits: count(),
      visitors: countDistinct(accessLogs.ip),
    })
    .from(accessLogs)
    .where(filter)
    .groupBy(weekday, hour)
    .orderBy(weekday, hour)

  return {
    data: rows.map(row => ({
      weekday: toNumber(row.weekday),
      hour: toNumber(row.hour),
      visits: toNumber(row.visits),
      visitors: toNumber(row.visitors),
    })),
  }
}

export interface AccessExportRow {
  slug?: string
  url?: string
  viewer?: number
  views?: number
  referer?: number
}

export async function queryExport(
  event: H3Event,
  query: Query,
): Promise<{ data: AccessExportRow[] }> {
  const filter = buildAnalyticsFilter(query)
  const total = count()
  const rows = await analyticsDb(event)
    .select({
      slug: accessLogs.slug,
      url: accessLogs.url,
      viewer: countDistinct(accessLogs.ip),
      views: total,
      referer: distinctReferers(),
    })
    .from(accessLogs)
    .where(filter)
    .groupBy(accessLogs.slug, accessLogs.url)
    .orderBy(desc(total))

  return {
    data: rows.map(row => ({
      slug: toText(row.slug),
      url: toText(row.url),
      viewer: toNumber(row.viewer),
      views: toNumber(row.views),
      referer: toNumber(row.referer),
    })),
  }
}

export async function queryEvents(event: H3Event, query: Query): Promise<LogEvent[]> {
  const filter = buildAnalyticsFilter(query)
  const rows = await analyticsDb(event)
    .select()
    .from(accessLogs)
    .where(filter)
    .orderBy(desc(accessLogs.timestamp))
    .limit(Math.max(0, Math.floor(query.limit)))

  return rows.map(row => ({
    // Full blob/double payload kept for compatibility with the previous
    // Analytics Engine event shape. `ip` is redacted on the wire (JSON drops
    // `undefined`), matching the old mapping.
    slug: row.slug,
    url: row.url,
    ua: row.ua,
    ip: undefined,
    referer: row.referer,
    country: row.country,
    region: row.region,
    city: row.city,
    timezone: row.timezone,
    language: row.language,
    os: row.os,
    browser: row.browser,
    browserType: row.browserType,
    device: row.device,
    deviceType: row.deviceType,
    COLO: row.colo,
    domain: row.domain,
    latitude: row.latitude,
    longitude: row.longitude,
    id: `access_${row.id}`,
    timestamp: Math.floor(row.timestamp / 1000),
  }))
}

export async function queryLocations(
  event: H3Event,
  query: Query,
): Promise<{ data: { city: string, latitude: number, longitude: number, count: number }[] }> {
  const filter = buildAnalyticsFilter(query)
  const conditions = [ne(accessLogs.latitude, 0), ne(accessLogs.longitude, 0)]
  if (filter)
    conditions.push(filter)

  const total = count()
  const rows = await analyticsDb(event)
    .select({
      city: accessLogs.city,
      latitude: accessLogs.latitude,
      longitude: accessLogs.longitude,
      count: total,
    })
    .from(accessLogs)
    .where(and(...conditions))
    .groupBy(accessLogs.city, accessLogs.latitude, accessLogs.longitude)
    .orderBy(desc(total))
    .limit(Math.max(0, Math.floor(query.limit)))

  return {
    data: rows.map(row => ({
      city: toText(row.city),
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      count: toNumber(row.count),
    })),
  }
}

/**
 * Deletes access-log rows older than the retention window. A non-positive
 * retention disables pruning. Returns the number of removed rows.
 */
export async function pruneAccessLogs(retentionDays: number): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0)
    return 0

  const env = await usePlatformEnv()
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const result = await drizzle(env.DB)
    .delete(accessLogs)
    .where(lt(accessLogs.timestamp, cutoff))
    .run()
  const changes = (result as { meta?: { changes?: number } }).meta?.changes ?? 0
  console.info(`[analytics] Pruned ${changes} access log row(s) older than ${retentionDays} day(s)`)
  return changes
}
