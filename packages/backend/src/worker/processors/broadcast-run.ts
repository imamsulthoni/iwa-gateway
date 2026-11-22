import type { Job } from 'bullmq'
import { BROADCAST_AUTO_PAUSE_MIN_RECIPIENTS, pickDelayMs } from '@wa/shared'
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
  autoPauseRatio: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CANCEL_CHECK_INTERVAL_MS = 2_000

export function createBroadcastRunProcessor(deps: BroadcastRunProcessorDeps) {
  return async (job: Job<BroadcastRunJob>): Promise<void> => {
    const { broadcastId, sessionId } = job.data
    const broadcast = await deps.broadcasts.get(broadcastId)

    // Job terjadwal yang usang (sudah dimulai/dijeda/dibatalkan) tidak dijalankan ulang.
    if (broadcast.status !== 'scheduled' && broadcast.status !== 'pending') return

    if (broadcast.status === 'scheduled') {
      await deps.broadcasts.setStatus(broadcastId, 'pending')
    }
    await deps.broadcasts.setStatus(broadcastId, 'running', { startedAt: new Date() })

    await deps.broadcasts.skipOptedOut(broadcastId)

    const isStopped = async (): Promise<boolean> => {
      const current = await deps.broadcasts.get(broadcastId)
      return current.status === 'cancelled' || current.status === 'paused'
    }

    const pending = await deps.broadcasts.pendingRecipients(broadcastId)
    let sent = 0
    let failed = 0

    for (const [index, recipient] of pending.entries()) {
      if (await isStopped()) {
        deps.logger.info({ broadcastId }, 'Broadcast dihentikan')
        return
      }

      const session = await deps.sessions.get(sessionId)
      const sentToday = await deps.messages.countToday(
        sessionId,
        startOfDayUtc(new Date(), deps.timezone),
      )
      if (sentToday >= session.dailySendLimit) {
        for (const remaining of pending.slice(index)) {
          await deps.broadcasts.markRecipient(broadcast, remaining, 'failed', {
            error: 'Batas harian tercapai',
            emit: false,
          })
          failed += 1
        }
        break
      }

      const { message, duplicate } = await deps.messages.createOutgoing({
        sessionId,
        to: recipient.toJid,
        clientRef: `${broadcastId}:${recipient.id}`,
        text: broadcast.text,
        customerName: recipient.name ?? undefined,
        broadcastId,
      })

      if (duplicate && message.status !== 'queued') {
        await deps.broadcasts.markRecipient(
          broadcast,
          recipient,
          message.status === 'failed' ? 'failed' : 'sent',
          { error: message.error, messageId: message.id },
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
        await deps.broadcasts.markRecipient(broadcast, recipient, 'sent', {
          messageId: message.id,
        })
        sent += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Gagal mengirim pesan'
        await deps.messages.markFailed(message.id, reason)
        await deps.broadcasts.markRecipient(broadcast, recipient, 'failed', {
          error: reason,
          messageId: message.id,
        })
        failed += 1
        deps.logger.error({ broadcastId, recipientId: recipient.id, err: error }, 'Penerima gagal')
      }

      const processed = sent + failed
      if (
        processed >= BROADCAST_AUTO_PAUSE_MIN_RECIPIENTS &&
        failed / processed > deps.autoPauseRatio
      ) {
        const reason = `Tingkat gagal ${Math.round((failed / processed) * 100)}% melewati ambang ${Math.round(deps.autoPauseRatio * 100)}%`
        await deps.broadcasts.setStatus(broadcastId, 'paused', { pauseReason: reason })
        deps.logger.warn({ broadcastId, sent, failed }, 'Broadcast dijeda otomatis')
        return
      }

      if (index === pending.length - 1) break
      const delayMs = pickDelayMs(broadcast.minDelayMs / 1000, broadcast.maxDelayMs / 1000)
      const chunks = Math.ceil(delayMs / CANCEL_CHECK_INTERVAL_MS)
      for (let chunk = 0; chunk < chunks; chunk += 1) {
        await sleep(Math.min(CANCEL_CHECK_INTERVAL_MS, delayMs - chunk * CANCEL_CHECK_INTERVAL_MS))
        if (await isStopped()) {
          deps.logger.info({ broadcastId }, 'Broadcast dihentikan di tengah jeda')
          return
        }
      }
    }

    const latest = await deps.broadcasts.get(broadcastId)
    if (latest.status === 'cancelled' || latest.status === 'paused') return
    const finalStatus = sent === 0 && failed > 0 ? 'failed' : 'done'
    await deps.broadcasts.setStatus(broadcastId, finalStatus, { finishedAt: new Date() })
    deps.logger.info({ broadcastId, sent, failed }, 'Broadcast selesai')
  }
}
