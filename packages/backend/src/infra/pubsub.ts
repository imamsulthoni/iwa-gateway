import { sseEventSchema, type SseEvent } from '@wa/shared'
import type { Redis } from 'ioredis'

const SESSION_EVENTS_PREFIX = 'wa:events:'

export function sessionEventsChannel(sessionId: string): string {
  return `${SESSION_EVENTS_PREFIX}${sessionId}`
}

export function encodeSessionEvent(event: SseEvent): string {
  return JSON.stringify(event)
}

export function decodeSessionEvent(payload: string): SseEvent | null {
  try {
    const parsed = sseEventSchema.safeParse(JSON.parse(payload))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function publishSessionEvent(
  redis: Redis,
  sessionId: string,
  event: SseEvent,
): Promise<void> {
  await redis.publish(sessionEventsChannel(sessionId), encodeSessionEvent(event))
}

export function subscribeSessionEvents(
  redis: Redis,
  sessionId: string,
  handler: (event: SseEvent) => void,
): () => Promise<void> {
  const subscriber = redis.duplicate()
  const channel = sessionEventsChannel(sessionId)
  const onMessage = (received: string, payload: string): void => {
    if (received !== channel) return
    const event = decodeSessionEvent(payload)
    if (event) handler(event)
  }

  subscriber.on('message', onMessage)
  void subscriber.subscribe(channel).catch(() => undefined)

  return async () => {
    subscriber.off('message', onMessage)
    await subscriber.unsubscribe(channel).catch(() => undefined)
    await subscriber.quit().catch(() => undefined)
  }
}
