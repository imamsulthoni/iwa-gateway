import type { Redis } from 'ioredis'
import { describe, expect, it, vi } from 'vitest'

import { activeSseConnections, incCounter, readCounters, trackSseConnection } from './metrics.js'

function fakeRedis(overrides: Partial<Redis> = {}): Redis {
  return {
    hincrby: vi.fn(async () => 1),
    hmget: vi.fn(async () => [null, '2']),
    ...overrides,
  } as unknown as Redis
}

describe('metrik', () => {
  it('menambah counter di hash Redis dan mengabaikan kegagalan', async () => {
    const redis = fakeRedis()
    incCounter(redis, 'inboundProcessed')
    incCounter(redis, 'webhookRetry', 2)
    expect(redis.hincrby).toHaveBeenCalledWith('wa:metrics', 'inboundProcessed', 1)
    expect(redis.hincrby).toHaveBeenCalledWith('wa:metrics', 'webhookRetry', 2)

    const failing = fakeRedis({ hincrby: vi.fn(() => Promise.reject(new Error('redis down'))) })
    expect(() => incCounter(failing, 'inboundNonText')).not.toThrow()
    incCounter(undefined, 'inboundNonText')
    incCounter(redis, 'inboundNonText', 0)
    expect(redis.hincrby).toHaveBeenCalledTimes(2)
  })

  it('membaca counter kosong sebagai nol', async () => {
    const snapshot = await readCounters(fakeRedis())
    expect(snapshot.inboundProcessed).toBe(0)
    expect(snapshot.inboundDuplicates).toBe(2)
    expect(snapshot.webhookFailed).toBe(0)
  })

  it('menghitung koneksi SSE aktif tanpa menjadi negatif', () => {
    const before = activeSseConnections()
    const close = trackSseConnection()
    expect(activeSseConnections()).toBe(before + 1)

    close()
    close()
    expect(activeSseConnections()).toBe(before)
  })
})
