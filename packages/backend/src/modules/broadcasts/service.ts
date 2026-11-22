import {
  isValidDelayRange,
  type BroadcastCurrentDto,
  type BroadcastV1ResponseDto,
  type CreateBroadcastInput,
  type WebhookPayload,
} from '@wbc/shared'

import { newId } from '../../db/id.js'
import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import type { AppLogger } from '../../infra/logger.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { phoneFromJid, toUserJid } from '../messages/phone.js'
import type { OptOutsService } from '../opt-outs/service.js'
import type { WebhookOutbox } from '../webhooks/outbox.js'
import type { BroadcastsRepository } from './repository.js'

export type BroadcastsService = ReturnType<typeof createBroadcastsService>

export type BroadcastsServiceDeps = {
  webhooks?: WebhookOutbox
  logger?: Pick<AppLogger, 'warn'>
}

export type RecipientInput = {
  to: string
  name?: string
  ref?: string
}

export const OPT_OUT_SKIP_REASON = 'opted_out'

const TERMINAL_STATUSES = new Set<BroadcastRow['status']>(['done', 'paused', 'failed', 'cancelled'])

// Broadcast final tidak lagi dianggap "berjalan", jadi tidak ditampilkan di
// dashboard setelah selesai.
const FINISHED_BROADCAST_STATUSES = new Set<BroadcastRow['status']>([
  'done',
  'failed',
  'cancelled',
])

export function prepareRecipients(
  recipients: RecipientInput[],
): { toJid: string; name: string | null; ref: string | null }[] {
  const seen = new Set<string>()
  const seenRefs = new Set<string>()
  return recipients.map((recipient) => {
    const toJid = toUserJid(recipient.to)
    if (seen.has(toJid)) {
      throw new ValidationError(`Nomor ${recipient.to} duplikat dalam daftar penerima`)
    }
    seen.add(toJid)
    if (recipient.ref !== undefined) {
      if (seenRefs.has(recipient.ref)) {
        throw new ValidationError(`Ref ${recipient.ref} duplikat dalam daftar penerima`)
      }
      seenRefs.add(recipient.ref)
    }
    return { toJid, name: recipient.name ?? null, ref: recipient.ref ?? null }
  })
}

export function summarize(recipients: BroadcastRecipientRow[]) {
  const sent = recipients.filter((recipient) => recipient.status === 'sent').length
  const failed = recipients.filter((recipient) => recipient.status === 'failed').length
  const skipped = recipients.filter((recipient) => recipient.status === 'skipped').length
  const optedOut = recipients.filter(
    (recipient) => recipient.status === 'skipped' && recipient.error === OPT_OUT_SKIP_REASON,
  ).length
  return { total: recipients.length, sent, failed, skipped, optedOut }
}

export function createBroadcastsService(
  repo: BroadcastsRepository,
  optOuts: OptOutsService,
  deps: BroadcastsServiceDeps = {},
) {
  async function get(id: string): Promise<BroadcastRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Broadcast tidak ditemukan')
    return row
  }

  async function record(payload: WebhookPayload): Promise<void> {
    if (!deps.webhooks) return
    try {
      await deps.webhooks.record(payload)
    } catch (error) {
      deps.logger?.warn(
        { sessionId: payload.session_id, eventType: payload.type, err: error },
        'Gagal menulis outbox webhook broadcast',
      )
    }
  }

  function toCurrent(row: BroadcastRow, recipients: BroadcastRecipientRow[]): BroadcastCurrentDto {
    const { total, sent, failed, skipped, optedOut } = summarize(recipients)
    return {
      jobId: row.id,
      status: row.status,
      total,
      done: sent + failed + skipped,
      sent,
      failed,
      skipped,
      optedOut,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      pauseReason: row.pauseReason,
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        to: recipient.toJid,
        name: recipient.name,
        ref: recipient.ref,
        status: recipient.status,
        error: recipient.error,
      })),
    }
  }

  async function toDetail(row: BroadcastRow): Promise<BroadcastV1ResponseDto> {
    return {
      ...toCurrent(row, await repo.listRecipients(row.id)),
      id: row.id,
      sessionId: row.sessionId,
      text: row.text,
      clientRef: row.clientRef,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }
  }

  async function setStatus(
    id: string,
    status: BroadcastRow['status'],
    patch: Partial<Pick<BroadcastRow, 'scheduledAt' | 'startedAt' | 'finishedAt' | 'pauseReason'>> = {},
  ): Promise<void> {
    await repo.updateStatus(id, status, patch)
    if (!TERMINAL_STATUSES.has(status)) return

    const row = await repo.findById(id)
    if (!row) return
    const { total, sent, failed, skipped, optedOut } = summarize(await repo.listRecipients(id))
    await record({
      id: newId(),
      type: 'broadcast.status',
      session_id: row.sessionId,
      data: {
        broadcast_id: row.id,
        status: status as 'done' | 'paused' | 'failed' | 'cancelled',
        total,
        sent,
        failed,
        skipped,
        opted_out: optedOut,
        pause_reason: row.pauseReason,
        occurred_at: new Date().toISOString(),
      },
    })
  }

  return {
    get,

    async detail(id: string): Promise<BroadcastV1ResponseDto> {
      return toDetail(await get(id))
    },

    async create(
      sessionId: string,
      input: CreateBroadcastInput,
      scheduledAt: Date | null = null,
    ): Promise<{ broadcast: BroadcastRow; duplicate: boolean }> {
      if (!isValidDelayRange(input.minDelay, input.maxDelay)) {
        throw new ValidationError('Delay harus 10-600 detik dan max tidak boleh kurang dari min')
      }
      if (input.recipients.length === 0) {
        throw new ValidationError('Daftar penerima tidak boleh kosong')
      }

      const existing = await repo.findByClientRef(sessionId, input.clientRef)
      if (existing) return { broadcast: existing, duplicate: true }

      const prepared = prepareRecipients(input.recipients)
      const optedOut = await optOuts.optedOutPhones(
        prepared.map((item) => phoneFromJid(item.toJid)),
      )
      const recipients = prepared.map((recipient) => {
        const skipped = optedOut.has(phoneFromJid(recipient.toJid))
        return {
          ...recipient,
          status: skipped ? ('skipped' as const) : ('pending' as const),
          error: skipped ? OPT_OUT_SKIP_REASON : null,
        }
      })

      const id = newId()
      await repo.createWithRecipients(
        {
          id,
          sessionId,
          text: input.text,
          status: scheduledAt ? 'scheduled' : 'pending',
          minDelayMs: input.minDelay * 1000,
          maxDelayMs: input.maxDelay * 1000,
          clientRef: input.clientRef,
          scheduledAt,
        },
        recipients,
      )
      return { broadcast: await get(id), duplicate: false }
    },

    async current(sessionId: string): Promise<BroadcastCurrentDto | null> {
      const row = await repo.findLatestBySession(sessionId)
      if (!row) return null
      if (FINISHED_BROADCAST_STATUSES.has(row.status)) return null
      return toCurrent(row, await repo.listRecipients(row.id))
    },

    async start(id: string): Promise<BroadcastRow> {
      const row = await get(id)
      if (!['scheduled', 'pending', 'paused'].includes(row.status)) {
        throw new ValidationError(`Broadcast berstatus ${row.status} tidak bisa dimulai`)
      }
      await repo.updateStatus(id, 'pending', { pauseReason: null })
      return get(id)
    },

    async pause(id: string): Promise<BroadcastRow> {
      const row = await get(id)
      if (!['scheduled', 'pending', 'running'].includes(row.status)) {
        throw new ValidationError(`Broadcast berstatus ${row.status} tidak bisa dijeda`)
      }
      await setStatus(id, 'paused')
      return get(id)
    },

    async cancel(sessionId: string): Promise<BroadcastRow> {
      const row = await repo.findLatestBySession(sessionId)
      if (!row) throw new NotFoundError('Broadcast tidak ditemukan')
      if (!['scheduled', 'pending', 'running', 'paused'].includes(row.status)) {
        throw new ValidationError(`Broadcast sudah berstatus ${row.status}`)
      }
      await setStatus(row.id, 'cancelled')
      return get(row.id)
    },

    setStatus,

    async skipOptedOut(broadcastId: string): Promise<void> {
      const pending = (await repo.listRecipients(broadcastId)).filter(
        (recipient) => recipient.status === 'pending',
      )
      const optedOut = await optOuts.optedOutPhones(
        pending.map((recipient) => phoneFromJid(recipient.toJid)),
      )
      await repo.skipRecipients(
        pending
          .filter((recipient) => optedOut.has(phoneFromJid(recipient.toJid)))
          .map((recipient) => recipient.id),
        OPT_OUT_SKIP_REASON,
      )
    },

    async pendingRecipients(broadcastId: string): Promise<BroadcastRecipientRow[]> {
      const recipients = await repo.listRecipients(broadcastId)
      return recipients.filter((recipient) => recipient.status === 'pending')
    },

    async markRecipient(
      broadcast: BroadcastRow,
      recipient: BroadcastRecipientRow,
      status: BroadcastRecipientRow['status'],
      options: { error?: string | null; messageId?: string | null; emit?: boolean } = {},
    ): Promise<void> {
      const error = options.error ?? null
      const messageId = options.messageId ?? null
      await repo.updateRecipient(recipient.id, { status, error, messageId })
      if (options.emit === false) return
      if (status !== 'sent' && status !== 'failed' && status !== 'skipped') return
      await record({
        id: newId(),
        type: 'broadcast.recipient',
        session_id: broadcast.sessionId,
        data: {
          broadcast_id: broadcast.id,
          recipient_id: recipient.id,
          to: recipient.toJid,
          phone: phoneFromJid(recipient.toJid),
          ref: recipient.ref,
          status,
          message_id: messageId,
          error,
          occurred_at: new Date().toISOString(),
        },
      })
    },

    async countRunning(): Promise<number> {
      return repo.countByStatus('running')
    },
  }
}
