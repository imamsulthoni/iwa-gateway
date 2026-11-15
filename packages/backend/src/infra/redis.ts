import { Redis } from 'ioredis'

export type RedisClient = Redis

export function createRedis(url: string): RedisClient {
  return new Redis(url, { maxRetriesPerRequest: null })
}

export async function closeRedis(client: RedisClient): Promise<void> {
  await client.quit()
}
