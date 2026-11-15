import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SessionLock } from '../../src/infra/lock.js'
import { validateEnv } from '../../src/infra/env.js'
import { closeRedis, createRedis, type RedisClient } from '../../src/infra/redis.js'
import { RUN_INTEGRATION } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describeIntegration('lock sesi Redis', () => {
  let redis: RedisClient

  beforeAll(() => {
    redis = createRedis(validateEnv().REDIS_URL)
  })

  afterAll(async () => {
    await closeRedis(redis)
  })

  it('hanya satu acquirer yang berhasil', async () => {
    const key = `wa:test:lock:${Date.now()}`
    const first = await SessionLock.acquire(redis, key, 5000)
    const second = await SessionLock.acquire(redis, key, 5000)

    expect(first).not.toBeNull()
    expect(second).toBeNull()
    await first?.release()
  })

  it('release aman hanya oleh pemilik', async () => {
    const key = `wa:test:lock:${Date.now()}`
    const first = await SessionLock.acquire(redis, key, 5000)
    expect(await first?.release()).toBe(true)
    expect(await first?.release()).toBe(false)
  })

  it('lock kedaluwarsa dapat diambil alih', async () => {
    const key = `wa:test:lock:${Date.now()}`
    const first = await SessionLock.acquire(redis, key, 100)
    expect(first).not.toBeNull()
    await sleep(180)
    const second = await SessionLock.acquire(redis, key, 5000)
    expect(second).not.toBeNull()
    await second?.release()
  })

  it('renewal memperpanjang TTL', async () => {
    const key = `wa:test:lock:${Date.now()}`
    const lock = await SessionLock.acquire(redis, key, 200)
    expect(lock).not.toBeNull()
    await sleep(120)
    expect(await lock?.renew()).toBe(true)
    await sleep(120)
    expect(await SessionLock.acquire(redis, key, 5000)).toBeNull()
    await lock?.release()
  })
})
