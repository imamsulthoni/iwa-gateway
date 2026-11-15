import { randomUUID } from 'node:crypto'

import type { Redis } from 'ioredis'

const RENEW_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0
`

const RELEASE_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0
`

export class SessionLock {
  private constructor(
    private readonly redis: Redis,
    readonly key: string,
    private readonly token: string,
    readonly ttlMs: number,
  ) {}

  static async acquire(redis: Redis, key: string, ttlMs: number): Promise<SessionLock | null> {
    const token = randomUUID()
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX')
    return result === 'OK' ? new SessionLock(redis, key, token, ttlMs) : null
  }

  async renew(): Promise<boolean> {
    const result = await this.redis.eval(RENEW_SCRIPT, 1, this.key, this.token, String(this.ttlMs))
    return Number(result) === 1
  }

  async release(): Promise<boolean> {
    const result = await this.redis.eval(RELEASE_SCRIPT, 1, this.key, this.token)
    return Number(result) === 1
  }

  startRenewal(
    onLost?: () => void,
    intervalMs = Math.max(1000, Math.floor(this.ttlMs / 3)),
  ): () => void {
    let stopped = false
    const timer = setInterval(() => {
      void this.renew().then((ok) => {
        if (!ok && !stopped) {
          stopped = true
          clearInterval(timer)
          onLost?.()
        }
      })
    }, intervalMs)
    timer.unref()
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }
}
