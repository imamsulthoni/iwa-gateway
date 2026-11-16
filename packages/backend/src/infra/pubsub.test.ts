import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import type { Redis } from 'ioredis'

import {
  decodeSessionEvent,
  encodeSessionEvent,
  sessionEventsChannel,
  subscribeSessionEvents,
} from './pubsub.js'

const EVENT = {
  id: 'e1',
  event: 'session.status' as const,
  data: { status: 'connected' as const, phoneNumber: null, lastConnectedAt: null },
}

class FakeSubscriber extends EventEmitter {
  subscribe = vi.fn(async () => 1)
  unsubscribe = vi.fn(async () => 1)
  quit = vi.fn(async () => 'OK')
}

describe('pub/sub event sesi', () => {
  it('memakai channel per sesi dan bolak-balik JSON', () => {
    expect(sessionEventsChannel('s1')).toBe('wa:events:s1')
    expect(decodeSessionEvent(encodeSessionEvent(EVENT))).toEqual(EVENT)
    expect(decodeSessionEvent('bukan json')).toBeNull()
  })

  it('berhenti menerima event dan menutup koneksi saat unsubscribe', async () => {
    const subscriber = new FakeSubscriber()
    const redis = { duplicate: () => subscriber } as unknown as Redis
    const handler = vi.fn()

    const unsubscribe = subscribeSessionEvents(redis, 's1', handler)
    await vi.waitFor(() => expect(subscriber.subscribe).toHaveBeenCalledWith('wa:events:s1'))
    subscriber.emit('message', 'wa:events:s1', encodeSessionEvent(EVENT))
    expect(handler).toHaveBeenCalledWith(EVENT)

    await unsubscribe()
    subscriber.emit('message', 'wa:events:s1', encodeSessionEvent(EVENT))
    expect(handler).toHaveBeenCalledOnce()
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('wa:events:s1')
    expect(subscriber.quit).toHaveBeenCalled()
  })
})
