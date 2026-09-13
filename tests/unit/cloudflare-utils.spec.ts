import type { H3Event } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeAccessLog } from '../../server/utils/access-log'

vi.mock('#shared/utils/flag', () => ({ getFlag: vi.fn() }))

const event = {
  context: {
    cloudflare: { env: {} },
    link: { id: 'link-id' },
  },
} as unknown as H3Event

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('writeAccessLog', () => {
  it('never throws when production persistence is unavailable', () => {
    vi.stubEnv('NODE_ENV', 'production')

    expect(() => writeAccessLog(event, {})).not.toThrow()
  })

  it('logs access data outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    writeAccessLog(event, { slug: 'demo' })

    expect(log).toHaveBeenCalledWith('access logs:', { slug: 'demo' })
    log.mockRestore()
  })
})
