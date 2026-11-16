import { EventEmitter } from 'node:events'

import type { Redis } from 'ioredis'
import { describe, expect, it, vi } from 'vitest'

import {
  SESSION_CONTROL_CHANNEL,
  parseSessionControlMessage,
  publishSessionControl,
  subscribeSessionControl,
} from './session-control.js'

describe('parseSessionControlMessage', () => {
  it('menerima perintah start dan stop', () => {
    expect(parseSessionControlMessage('{"sessionId":"s1","action":"start"}')).toEqual({
      sessionId: 's1',
      action: 'start',
      clearAuth: false,
    })
    expect(
      parseSessionControlMessage('{"sessionId":"s1","action":"stop","clearAuth":true}'),
    ).toEqual({ sessionId: 's1', action: 'stop', clearAuth: true })
  })

  it('menolak payload rusak atau action tak dikenal', () => {
    expect(parseSessionControlMessage('bukan-json')).toBeNull()
    expect(parseSessionControlMessage('{"sessionId":"s1","action":"restart"}')).toBeNull()
    expect(parseSessionControlMessage('{"action":"start"}')).toBeNull()
  })
})

describe('session control', () => {
  it('publish mengirim JSON ke channel kontrol', async () => {
    const redis = { publish: vi.fn(async () => 1) } as unknown as Redis
    await publishSessionControl(redis, { sessionId: 's1', action: 'start' })
    expect(redis.publish).toHaveBeenCalledWith(
      SESSION_CONTROL_CHANNEL,
      '{"sessionId":"s1","action":"start"}',
    )
  })

  it('subscribe hanya memanggil handler untuk channel kontrol', async () => {
    const emitter = new EventEmitter()
    const redis = Object.assign(emitter, {
      subscribe: vi.fn(async () => 1),
      unsubscribe: vi.fn(async () => 1),
    }) as unknown as Redis
    const handler = vi.fn(async () => undefined)

    const stop = subscribeSessionControl(redis, handler)
    emitter.emit('message', 'channel-lain', '{"sessionId":"s1","action":"start"}')
    emitter.emit('message', SESSION_CONTROL_CHANNEL, '{"sessionId":"s2","action":"stop"}')
    stop()

    expect(redis.subscribe).toHaveBeenCalledWith(SESSION_CONTROL_CHANNEL)
    expect(redis.unsubscribe).toHaveBeenCalledWith(SESSION_CONTROL_CHANNEL)
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ sessionId: 's2', action: 'stop', clearAuth: false })
  })
})
