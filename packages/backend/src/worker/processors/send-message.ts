import type { Job } from 'bullmq'

import type { SendMessageJob } from '../../infra/queue.js'
import type { AppLogger } from '../../infra/logger.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionManager } from '../session-manager.js'

export type SendMessageProcessorDeps = {
  manager: SessionManager
  messages: MessagesService
  logger: AppLogger
}

export function createSendMessageProcessor({
  manager,
  messages,
  logger,
}: SendMessageProcessorDeps) {
  return async (job: Job<SendMessageJob>): Promise<void> => {
    const message = await messages.get(job.data.messageId)
    if (message.status !== 'queued') {
      logger.info({ messageId: message.id, status: message.status }, 'Pesan dilewati')
      return
    }

    try {
      const sent = await manager.sendText(
        message.sessionId,
        message.toJid ?? '',
        message.body ?? '',
      )
      await messages.markSent(message.id, sent?.key?.id ?? null, sent ?? null)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Gagal mengirim pesan'
      await messages.markFailed(message.id, reason)
      logger.error({ messageId: message.id, err: error }, 'Gagal mengirim pesan')
      throw error
    }
  }
}
