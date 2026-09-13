import { describe, expect, it } from 'vitest'
import { fetch, fetchWithAuth } from '../utils'

describe('/api/location', () => {
  it('returns location data with valid auth', async () => {
    const response = await fetchWithAuth('/api/location')

    expect(response.status).toBe(200)

    const data = await response.json()
    // In test environment, cf object may be undefined, so response could be empty or have undefined values
    expect(data).toBeTypeOf('object')
  })

  it('returns correct response structure', async () => {
    const response = await fetchWithAuth('/api/location')

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('returns reverse-proxy geo coordinates when provided', async () => {
    // The Node platform shim maps `x-geo-*` headers onto the Cloudflare `cf`
    // object that this endpoint reads.
    const response = await fetchWithAuth('/api/location', {
      headers: { 'x-geo-latitude': '37.7749', 'x-geo-longitude': '-122.4194' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ latitude: 37.7749, longitude: -122.4194 })
  })

  it('returns 401 when accessing without auth', async () => {
    const response = await fetch('/api/location')

    expect(response.status).toBe(401)
  })
})
