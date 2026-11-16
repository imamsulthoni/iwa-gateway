import type { Redis } from 'ioredis'

export const SESSION_CONTROL_CHANNEL = 'wa:session:control'

export type SessionControlAction = 'start' | 'stop'

export type SessionControlMessage = {
  sessionId: string
  action: SessionControlAction
  clearAuth?: boolean
}

export async function publishSessionControl(
  redis: Redis,
  message: SessionControlMessage,
): Promise<void> {
  await redis.publish(SESSION_CONTROL_CHANNEL, JSON.stringify(message))
}

export function parseSessionControlMessage(payload: string): SessionControlMessage | null {
  try {
    const value = JSON.parse(payload) as Partial<SessionControlMessage>
    if (typeof value.sessionId !== 'string' || !value.sessionId) return null
    if (value.action !== 'start' && value.action !== 'stop') return null
    return {
      sessionId: value.sessionId,
      action: value.action,
      clearAuth: value.clearAuth === true,
    }
  } catch {
    return null
  }
}

export function subscribeSessionControl(
  redis: Redis,
  handler: (message: SessionControlMessage) => Promise<void>,
): () => void {
  const onMessage = (channel: string, payload: string): void => {
    if (channel !== SESSION_CONTROL_CHANNEL) return
    const message = parseSessionControlMessage(payload)
    if (!message) return
    void handler(message)
  }

  redis.on('message', onMessage)
  void redis.subscribe(SESSION_CONTROL_CHANNEL)
  return () => {
    redis.off('message', onMessage)
    void redis.unsubscribe(SESSION_CONTROL_CHANNEL)
  }
}
