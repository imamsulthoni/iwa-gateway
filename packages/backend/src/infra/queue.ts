import { Queue, type ConnectionOptions } from 'bullmq'
import type { Redis } from 'ioredis'

export const SEND_QUEUE = 'wa-send'
export const BROADCAST_QUEUE = 'wa-broadcast'
export const WEBHOOK_QUEUE = 'wa-webhook'

export type SendMessageJob = {
  sessionId: string
  messageId: string
}

export type BroadcastRunJob = {
  sessionId: string
  broadcastId: string
}

export type WebhookDispatchJob = Record<string, never>

export type QueueRegistry = {
  send: Queue<SendMessageJob>
  broadcast: Queue<BroadcastRunJob>
  webhook: Queue<WebhookDispatchJob>
}

export function createQueues(connection: Redis): QueueRegistry {
  const options = { connection: connection as unknown as ConnectionOptions }
  return {
    send: new Queue<SendMessageJob>(SEND_QUEUE, options),
    broadcast: new Queue<BroadcastRunJob>(BROADCAST_QUEUE, options),
    webhook: new Queue<WebhookDispatchJob>(WEBHOOK_QUEUE, options),
  }
}

export async function enqueue<T>(
  queue: Queue<T>,
  name: string,
  data: T,
  jobId: string,
  delayMs = 0,
): Promise<void> {
  await queue.add(name as never, data as never, {
    jobId,
    delay: delayMs,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  })
}

export async function closeQueues(queues: QueueRegistry): Promise<void> {
  await Promise.all([queues.send.close(), queues.broadcast.close(), queues.webhook.close()])
}
