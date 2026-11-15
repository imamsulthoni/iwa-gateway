import { Worker, type ConnectionOptions, type Job } from 'bullmq'
import type { Redis } from 'ioredis'

import {
  BROADCAST_QUEUE,
  SEND_QUEUE,
  type BroadcastRunJob,
  type SendMessageJob,
} from '../../infra/queue.js'
import type { AppLogger } from '../../infra/logger.js'

export type ProcessorHandlers = {
  sendMessage: (job: Job<SendMessageJob>) => Promise<void>
  broadcastRun: (job: Job<BroadcastRunJob>) => Promise<void>
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

  sendWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Job kirim pesan gagal')
  })
  broadcastWorker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, err: error }, 'Job broadcast gagal')
  })

  return {
    async close() {
      await Promise.all([sendWorker.close(), broadcastWorker.close()])
    },
  }
}
