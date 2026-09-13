import type { H3Event } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import { getRequestHost } from 'h3'
import { parseAcceptLanguage } from 'intl-parse-accept-language'
import { UAParser } from 'ua-parser-js'
import {
  CLIs,
  Crawlers,
  Emails,
  ExtraDevices,
  Fetchers,
  InApps,
  MediaPlayers,
  Vehicles,
} from 'ua-parser-js/extensions'
import { parseURL } from 'ufo'
import { getFlag } from '#shared/utils/flag'
import { accessLogs as accessLogsTable } from '../database/schema'

function toBlobNumber(blob: string) {
  return +blob.replace(/\D/g, '')
}

function toLogText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function toLogNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const blobsMap = {
  blob1: 'slug',
  blob2: 'url',
  blob3: 'ua',
  blob4: 'ip',
  blob5: 'referer',
  blob6: 'country',
  blob7: 'region',
  blob8: 'city',
  blob9: 'timezone',
  blob10: 'language',
  blob11: 'os',
  blob12: 'browser',
  blob13: 'browserType',
  blob14: 'device',
  blob15: 'deviceType',
  blob16: 'COLO',
  blob17: 'domain',
} as const

export const doublesMap = {
  double1: 'latitude',
  double2: 'longitude',
} as const

export type BlobsMap = typeof blobsMap
export type BlobsKey = keyof BlobsMap

export type DoublesMap = typeof doublesMap
export type DoublesKey = keyof DoublesMap

export type LogsKey = BlobsMap[BlobsKey] | DoublesMap[DoublesKey]
export type LogsMap = {
  [key in BlobsMap[BlobsKey]]: string | undefined
} & {
  [key in DoublesMap[DoublesKey]]?: number | undefined
}

export interface WebhookClickContext {
  country: string
  region: string
  city: string
  device: string
  browser: string
  os: string
  referer: string
}

export interface AccessLogResult {
  logs: LogsMap
  click: WebhookClickContext
}

export const logsMap = Object.fromEntries([
  ...Object.entries(blobsMap).map(([k, v]) => [v, k]),
  ...Object.entries(doublesMap).map(([k, v]) => [v, k]),
]) as LogsMap

export function logs2blobs(logs: LogsMap) {
  return (Object.keys(blobsMap) as BlobsKey[])
    .sort((a, b) => toBlobNumber(a) - toBlobNumber(b))
    .map(key => String(logs[blobsMap[key] as LogsKey] || ''))
}

export function blobs2logs(blobs: string[]) {
  const logsList = Object.keys(blobsMap)

  return blobs.reduce((logs, blob, i) => {
    const key = blobsMap[logsList[i] as BlobsKey]
    logs[key] = blob
    return logs
  }, {} as Partial<LogsMap>)
}

export function logs2doubles(logs: LogsMap) {
  return (Object.keys(doublesMap) as DoublesKey[])
    .sort((a, b) => toBlobNumber(a) - toBlobNumber(b))
    .map(key => Number(logs[doublesMap[key] as LogsKey] || 0))
}

export function doubles2logs(doubles: number[]) {
  const logsList = Object.keys(doublesMap)

  return doubles.reduce((logs, double, i) => {
    const key = doublesMap[logsList[i] as DoublesKey]
    logs[key] = double
    return logs
  }, {} as Partial<LogsMap>)
}

function getCountryName(country?: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(country || 'WD') || 'Worldwide'
  }
  catch {
    return 'Worldwide'
  }
}

export function collectAccessLog(event: H3Event): AccessLogResult | undefined {
  const ip = getHeader(event, 'cf-connecting-ip') || getHeader(event, 'x-real-ip') || getRequestIP(event, { xForwardedFor: true })

  const { host: referer } = parseURL(getHeader(event, 'referer'))

  const acceptLanguage = getHeader(event, 'accept-language') || ''
  const language = (parseAcceptLanguage(acceptLanguage) || [])[0]

  const userAgent = getHeader(event, 'user-agent') || ''
  const uaInfo = (new UAParser(userAgent, {

    // @ts-expect-error
    browser: [Crawlers.browser || [], CLIs.browser || [], Emails.browser || [], Fetchers.browser || [], InApps.browser || [], MediaPlayers.browser || [], Vehicles.browser || []].flat(),

    // @ts-expect-error
    device: [ExtraDevices.device || []].flat(),
  })).getResult()

  const { cloudflare } = event.context
  const { request: { cf } } = cloudflare
  const link = event.context.link || {}

  const isBot = cf?.botManagement?.verifiedBot
    || ['crawler', 'fetcher'].includes(uaInfo?.browser?.type || '')
    || ['spider', 'bot'].includes(uaInfo?.browser?.name?.toLowerCase() || '')

  const { disableBotAccessLog } = useRuntimeConfig(event)
  if (isBot && disableBotAccessLog) {
    console.log('bot access log disabled:', userAgent)
    return
  }

  const countryName = getCountryName(cf?.country)
  const logs = {
    url: link.url,
    slug: link.slug,
    ua: userAgent,
    ip,
    referer,
    country: cf?.country,
    region: `${getFlag(cf?.country)} ${[cf?.region, countryName].filter(Boolean).join(',')}`,
    city: `${getFlag(cf?.country)} ${[cf?.city, countryName].filter(Boolean).join(',')}`,
    timezone: cf?.timezone,
    language,
    os: uaInfo?.os?.name,
    browser: uaInfo?.browser?.name,
    browserType: uaInfo?.browser?.type,
    device: uaInfo?.device?.model,
    deviceType: uaInfo?.device?.type,
    COLO: cf?.colo,
    // '' (default domain) links resolve on the host the visitor actually used.
    domain: link.domain === '' ? getRequestHost(event) : link.domain,

    // For RealTime Globe
    latitude: Number(cf?.latitude || getHeader(event, 'cf-iplatitude') || 0),
    longitude: Number(cf?.longitude || getHeader(event, 'cf-iplongitude') || 0),
  }

  return {
    logs,
    click: {
      country: cf?.country || '',
      region: cf?.region || '',
      city: cf?.city || '',
      device: uaInfo?.device?.type || uaInfo?.device?.model || '',
      browser: uaInfo?.browser?.name || '',
      os: uaInfo?.os?.name || '',
      referer: referer || '',
    },
  }
}

export function writeAccessLog(event: H3Event, accessLogs: LogsMap): void {
  const link = event.context.link || {}

  if (process.env.NODE_ENV === 'production') {
    try {
      // Persist to the local access_logs table through the D1 shim. The insert
      // is intentionally fire-and-forget so analytics never blocks (or breaks)
      // the redirect flow.
      const db = drizzle(event.context.cloudflare.env.DB)
      void Promise.resolve(db.insert(accessLogsTable).values({
        linkId: toLogText(link.id),
        // Milliseconds since epoch; API responses convert back to seconds.
        timestamp: Date.now(),
        slug: toLogText(accessLogs.slug),
        url: toLogText(accessLogs.url),
        ua: toLogText(accessLogs.ua),
        ip: toLogText(accessLogs.ip),
        referer: toLogText(accessLogs.referer),
        country: toLogText(accessLogs.country),
        region: toLogText(accessLogs.region),
        city: toLogText(accessLogs.city),
        timezone: toLogText(accessLogs.timezone),
        language: toLogText(accessLogs.language),
        os: toLogText(accessLogs.os),
        browser: toLogText(accessLogs.browser),
        browserType: toLogText(accessLogs.browserType),
        device: toLogText(accessLogs.device),
        deviceType: toLogText(accessLogs.deviceType),
        colo: toLogText(accessLogs.COLO),
        domain: toLogText(accessLogs.domain),
        latitude: toLogNumber(accessLogs.latitude),
        longitude: toLogNumber(accessLogs.longitude),
      }).run()).catch((error) => {
        console.error('writeAccessLog: failed to persist access log:', error)
      })
    }
    catch (error) {
      console.error('writeAccessLog: failed to persist access log:', error)
    }
    return
  }

  console.log('access logs:', accessLogs)
}
