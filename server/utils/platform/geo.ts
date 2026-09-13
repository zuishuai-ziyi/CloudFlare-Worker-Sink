import type { H3Event } from 'h3'
import type { CityResponse, Reader } from 'maxmind'
import { getHeader, getRequestIP } from 'h3'
import { open } from 'maxmind'

// Resolves `request.cf` for the Node runtime. Reverse-proxy injected `x-geo-*`
// headers take priority; an optional GeoLite2 mmdb is used as a fallback.

let cachedGeoipPath = ''
let geoipReaderPromise: Promise<Reader<CityResponse> | null> | null = null

async function getGeoipReader(dbPath: string): Promise<Reader<CityResponse> | null> {
  if (cachedGeoipPath !== dbPath) {
    cachedGeoipPath = dbPath
    geoipReaderPromise = open<CityResponse>(dbPath).catch((error) => {
      console.warn(`[platform:geo] Failed to open GeoIP database "${dbPath}":`, error)
      return null
    })
  }
  return geoipReaderPromise ?? null
}

/** Client IP resolution matching `server/utils/access-log.ts`. */
export function getClientIp(event: H3Event): string | undefined {
  return getHeader(event, 'cf-connecting-ip')
    || getHeader(event, 'x-real-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || undefined
}

function readNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '')
    return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Builds the Cloudflare `cf` object. All fields are optional because business
 * code already guards them with optional chaining.
 */
export async function resolveCfProperties(event: H3Event, geoipDb: string): Promise<Partial<IncomingRequestCfProperties>> {
  const cf: Record<string, unknown> = {}

  const country = getHeader(event, 'x-geo-country')
  const region = getHeader(event, 'x-geo-region')
  const city = getHeader(event, 'x-geo-city')
  const timezone = getHeader(event, 'x-geo-timezone')
  const latitude = readNumber(getHeader(event, 'x-geo-latitude'))
  const longitude = readNumber(getHeader(event, 'x-geo-longitude'))
  const colo = getHeader(event, 'x-geo-colo')

  if (country)
    cf.country = country
  if (region)
    cf.region = region
  if (city)
    cf.city = city
  if (timezone)
    cf.timezone = timezone
  if (latitude !== undefined)
    cf.latitude = latitude
  if (longitude !== undefined)
    cf.longitude = longitude

  const hasHeaderGeo = Boolean(country || region || city || timezone || latitude !== undefined || longitude !== undefined)
  if (!hasHeaderGeo && geoipDb) {
    const record = await lookupGeoip(event, geoipDb)
    if (record) {
      cf.country ??= record.country?.iso_code
      cf.region ??= record.subdivisions?.[0]?.names?.en
      cf.regionCode ??= record.subdivisions?.[0]?.iso_code
      cf.city ??= record.city?.names?.en
      cf.timezone ??= record.location?.time_zone
      cf.latitude ??= record.location?.latitude
      cf.longitude ??= record.location?.longitude
    }
  }

  cf.colo = colo || 'local'
  return cf as Partial<IncomingRequestCfProperties>
}

async function lookupGeoip(event: H3Event, geoipDb: string): Promise<CityResponse | null> {
  const ip = getClientIp(event)
  if (!ip)
    return null
  try {
    const reader = await getGeoipReader(geoipDb)
    return reader?.get(ip) ?? null
  }
  catch (error) {
    console.warn('[platform:geo] GeoIP lookup failed:', error)
    return null
  }
}
