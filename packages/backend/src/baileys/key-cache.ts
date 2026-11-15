const DEFAULT_TTL_MS = 5 * 60 * 1000

type CacheEntry = {
  value: unknown
  expiresAt: number
}

export type KeyCache = {
  get<T>(key: string): T | undefined
  set<T>(key: string, value: T): void
  del(key: string): void
  flushAll(): void
}

export function createKeyCache(ttlMs = DEFAULT_TTL_MS): KeyCache {
  const entries = new Map<string, CacheEntry>()

  const cache: KeyCache = {
    get<T>(key: string): T | undefined {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value as T
    },
    set<T>(key: string, value: T): void {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    del(key: string): void {
      entries.delete(key)
    },
    flushAll(): void {
      entries.clear()
    },
  }
  return cache
}
