import { Worker, type ConnectionOptions, type Job } from 'bullmq'
import type { Redis } from 'ioredis'

import {
  BROADCAST_QUEUE,
  SEND_QUEUE,
  WEBHOOK_QUEUE,
  type BroadcastRunJob,
  type SendMessageJob,
  type WebhookDispatchJob,
} from '../../infra/queue.js'
import type { AppLogger } from '../../infra/logger.js'

export type ProcessorHandlers = {
  sendMessage: (job: Job<SendMessageJob>) => Promise<void>
  broadcastRun: (job: Job<BroadcastRunJob>) => Promise<void>
  webhookDispatch: (job: Job<WebhookDispatchJob>) => Promise<void>
}

export type ProcessorRegistry = {
  close: () => Promise<void>
}

export function startProcessors(
  connection: Redis,
  handlers: ProcessorHandlers,
  logger: AppLogger,
): ProcessorRegistry {
  const options = {
    connection: connection as unknown as ConnectionOptions,
    concurrency: 1,
  }
  const sendWorker = new Worker<SendMessageJob>(SEND_QUEUE, handlers.sendMessage, options)
  const broadcastWorker = new Worker<BroadcastRunJob>(
    BROADCAST_QUEUE,
    handlers.broadcastRun,
    options,
  )
  const webhookWorker = new Worker<WebhookDispatchJob>(
    WEBHOOK_QUEUE,
    handlers.webhookDispatch,
    options,
  )

  sendWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Job kirim pesan gagal')
  })
  broadcastWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Job broadcast gagal')
  })
  webhookWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Job webhook gagal')
  })

  return {
    async close() {
      await Promise.all([sendWorker.close(), broadcastWorker.close(), webhookWorker.close()])
    },
  }
}
