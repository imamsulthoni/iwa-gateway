import type { Job } from 'bullmq'
import { pickDelayMs } from '@wa/shared'
import { BufferJSON } from '@whiskeysockets/baileys'

import type { BroadcastRunJob } from '../../infra/queue.js'
import type { AppLogger } from '../../infra/logger.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import { startOfDayUtc } from '../../modules/stats/service.js'
import type { SessionManager } from '../session-manager.js'

export type BroadcastRunProcessorDeps = {
  manager: SessionManager
  broadcasts: BroadcastsService
  messages: MessagesService
  sessions: SessionsService
  logger: AppLogger
  timezone: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CANCEL_CHECK_INTERVAL_MS = 2_000

export function createBroadcastRunProcessor(deps: BroadcastRunProcessorDeps) {
  return async (job: Job<BroadcastRunJob>): Promise<void> => {
    const { broadcastId, sessionId } = job.data
    const broadcast = await deps.broadcasts.get(broadcastId)
    await deps.broadcasts.setStatus(broadcastId, 'running')

    const isCancelled = async (): Promise<boolean> => {
      const current = await deps.broadcasts.get(broadcastId)
      return current.status === 'cancelled'
    }

    const pending = await deps.broadcasts.pendingRecipients(broadcastId)
    let sent = 0
    let failed = 0

    for (const [index, recipient] of pending.entries()) {
      if (await isCancelled()) {
        deps.logger.info({ broadcastId }, 'Broadcast dibatalkan')
        return
      }

      const session = await deps.sessions.get(sessionId)
      const sentToday = await deps.messages.countToday(
        sessionId,
        startOfDayUtc(new Date(), deps.timezone),
      )
      if (sentToday >= session.dailySendLimit) {
        for (const remaining of pending.slice(index)) {
          await deps.broadcasts.markRecipient(remaining.id, 'failed', 'Batas harian tercapai')
          failed += 1
        }
        break
      }

      const { message, duplicate } = await deps.messages.createOutgoing({
        sessionId,
        to: recipient.toJid,
        referenceId: `${broadcastId}:${recipient.id}`,
        text: broadcast.template,
        customerName: recipient.name ?? undefined,
        broadcastId,
      })

      if (duplicate && message.status !== 'queued') {
        await deps.broadcasts.markRecipient(
          recipient.id,
          message.status === 'failed' ? 'failed' : 'sent',
          message.error,
        )
        if (message.status === 'failed') failed += 1
        else sent += 1
        continue
      }

      try {
        const result = await deps.manager.sendText(sessionId, message.to ?? '', message.body ?? '')
        await deps.messages.markSent(
          message.id,
          result?.key?.id ?? null,
          result ? JSON.stringify(result, BufferJSON.replacer) : null,
        )
        await deps.broadcasts.markRecipient(recipient.id, 'sent')
        sent += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Gagal mengirim pesan'
        await deps.messages.markFailed(message.id, reason)
        await deps.broadcasts.markRecipient(recipient.id, 'failed', reason)
        failed += 1
        deps.logger.error({ broadcastId, recipientId: recipient.id, err: error }, 'Penerima gagal')
      }

      if (index === pending.length - 1) break
      const delayMs = pickDelayMs(broadcast.minDelayMs / 1000, broadcast.maxDelayMs / 1000)
      const chunks = Math.ceil(delayMs / CANCEL_CHECK_INTERVAL_MS)
      for (let chunk = 0; chunk < chunks; chunk += 1) {
        await sleep(Math.min(CANCEL_CHECK_INTERVAL_MS, delayMs - chunk * CANCEL_CHECK_INTERVAL_MS))
        if (await isCancelled()) {
          deps.logger.info({ broadcastId }, 'Broadcast dibatalkan di tengah jeda')
          return
        }
      }
    }

    const latest = await deps.broadcasts.get(broadcastId)
    if (latest.status === 'cancelled') return
    const finalStatus = sent === 0 && failed > 0 ? 'failed' : 'done'
    await deps.broadcasts.setStatus(broadcastId, finalStatus)
    deps.logger.info({ broadcastId, sent, failed }, 'Broadcast selesai')
  }
}
