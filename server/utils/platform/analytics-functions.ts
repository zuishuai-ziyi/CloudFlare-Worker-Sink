import type { Database } from 'better-sqlite3'

// SQLite has no IANA timezone support, so analytics bucketing delegates to
// `Intl` through user-defined functions registered on the shared better-sqlite3
// connection. The names below are referenced from `server/utils/analytics.ts`.

type BucketUnit = 'minute' | 'hour' | 'day'

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    formatterCache.set(timeZone, formatter)
  }
  return formatter
}

interface DateParts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

function dateParts(timestamp: number, timeZone: string): DateParts {
  const parts = getFormatter(timeZone).formatToParts(new Date(timestamp))
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '00'
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  }
}

/** Formats a millisecond epoch into the ClickHouse-style buckets used before. */
export function bucketTimestamp(timestamp: number, unit: BucketUnit, timeZone: string): string {
  const { year, month, day, hour, minute } = dateParts(timestamp, timeZone)
  if (unit === 'day')
    return `${year}-${month}-${day}`
  if (unit === 'hour')
    return `${year}-${month}-${day} ${hour}`
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/** ISO weekday (Monday = 1 ... Sunday = 7), matching ClickHouse `toDayOfWeek`. */
export function weekdayTimestamp(timestamp: number, timeZone: string): number {
  const { year, month, day } = dateParts(timestamp, timeZone)
  const dayOfWeek = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay()
  return ((dayOfWeek + 6) % 7) + 1
}

/** Hour of day (0 ... 23) in the requested timezone. */
export function hourTimestamp(timestamp: number, timeZone: string): number {
  return Number(dateParts(timestamp, timeZone).hour)
}

/** Registers analytics helpers on a better-sqlite3 connection. */
export function registerAnalyticsFunctions(database: Database): void {
  database.function('analytics_bucket', { deterministic: true }, (timestamp, unit, timeZone) =>
    bucketTimestamp(Number(timestamp), String(unit) as BucketUnit, String(timeZone)))
  database.function('analytics_weekday', { deterministic: true }, (timestamp, timeZone) =>
    weekdayTimestamp(Number(timestamp), String(timeZone)))
  database.function('analytics_hour', { deterministic: true }, (timestamp, timeZone) =>
    hourTimestamp(Number(timestamp), String(timeZone)))
}
