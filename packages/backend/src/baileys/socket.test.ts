import { describe, expect, it, vi } from 'vitest'

import { createSocket } from './socket.js'

const { makeWASocket, ubuntu } = vi.hoisted(() => ({
  makeWASocket: vi.fn((_options?: unknown) => ({ id: 'socket' })),
  ubuntu: vi.fn(() => ['Ubuntu', 'Chrome', '120']),
}))

vi.mock('@whiskeysockets/baileys', () => ({
  default: makeWASocket,
  Browsers: { ubuntu },
}))

describe('factory socket', () => {
  it('memakai konfigurasi terpusat', () => {
    createSocket({
      auth: { creds: {}, keys: {} } as never,
      logger: {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as never,
      browserName: 'WA Bot Console',
      msgRetryCounterCache: { get: vi.fn(), set: vi.fn(), del: vi.fn(), flushAll: vi.fn() },
    })

    expect(ubuntu).toHaveBeenCalledWith('WA Bot Console')
    const options = makeWASocket.mock.calls[0]?.[0] as {
      markOnlineOnConnect: boolean
      syncFullHistory: boolean
      shouldIgnoreJid: (jid: string) => boolean
    }
    expect(options.markOnlineOnConnect).toBe(false)
    expect(options.syncFullHistory).toBe(false)
    expect(options.shouldIgnoreJid('1203630@g.us')).toBe(true)
    expect(options.shouldIgnoreJid('628123456789@s.whatsapp.net')).toBe(false)
  })
})
