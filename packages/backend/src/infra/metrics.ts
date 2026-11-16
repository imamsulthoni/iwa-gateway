import type { Redis } from 'ioredis'

// Hash Redis agar counter dari proses API dan worker terlihat di endpoint health.
export const METRICS_KEY = 'wa:metrics'

export const COUNTER_NAMES = [
  'inboundProcessed',
  'inboundDuplicates',
  'inboundNonText',
  'webhookDelivered',
  'webhookFailed',
  'webhookRetry',
] as const

export type CounterName = (typeof COUNTER_NAMES)[number]

export type CounterSnapshot = Record<CounterName, number>

let sseConnections = 0

export function incCounter(redis: Redis | undefined, name: CounterName, by = 1): void {
  if (by === 0) return
  // Best-effort: kegagalan metrik tidak boleh menggagalkan pemrosesan pesan.
  void redis?.hincrby(METRICS_KEY, name, by).catch(() => undefined)
}

export function trackSseConnection(): () => void {
  sseConnections += 1
  let closed = false
  return () => {
    if (closed) return
    closed = true
    sseConnections -= 1
  }
}

export function activeSseConnections(): number {
  return sseConnections
}

export async function readCounters(redis: Redis): Promise<CounterSnapshot> {
  const values = await redis.hmget(METRICS_KEY, ...COUNTER_NAMES)
  return Object.fromEntries(
    COUNTER_NAMES.map((name, index) => [name, Number(values[index] ?? 0)]),
  ) as CounterSnapshot
}
