import {
  isValidDelayRange,
  type BroadcastCurrentDto,
  type BroadcastV1ResponseDto,
  type CreateBroadcastInput,
} from '@wa/shared'

import { newId } from '../../db/id.js'
import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { phoneFromJid, toUserJid } from '../messages/phone.js'
import type { OptOutsService } from '../opt-outs/service.js'
import type { BroadcastsRepository } from './repository.js'

export type BroadcastsService = ReturnType<typeof createBroadcastsService>

export type RecipientInput = {
  to: string
  name?: string
}

export const OPT_OUT_SKIP_REASON = 'opted_out'

export type BroadcastDelays = { minDelay: number; maxDelay: number }

export type ResolvedBroadcastInput = Omit<CreateBroadcastInput, 'minDelay' | 'maxDelay'> &
  BroadcastDelays

// Broadcast final tidak lagi dianggap "berjalan", jadi tidak ditampilkan di
// dashboard setelah selesai.
const FINISHED_BROADCAST_STATUSES = new Set<BroadcastRow['status']>([
  'done',
  'failed',
  'cancelled',
])

export function prepareRecipients(
  recipients: RecipientInput[],
): { toJid: string; name: string | null }[] {
  const seen = new Set<string>()
  return recipients.map((recipient) => {
    const toJid = toUserJid(recipient.to)
    if (seen.has(toJid)) {
      throw new ValidationError(`Nomor ${recipient.to} duplikat dalam daftar penerima`)
    }
    seen.add(toJid)
    return { toJid, name: recipient.name ?? null }
  })
}

export function createBroadcastsService(repo: BroadcastsRepository, optOuts: OptOutsService) {
  async function get(id: string): Promise<BroadcastRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Broadcast tidak ditemukan')
    return row
  }

  function toCurrent(row: BroadcastRow, recipients: BroadcastRecipientRow[]): BroadcastCurrentDto {
    const sent = recipients.filter((recipient) => recipient.status === 'sent').length
    const failed = recipients.filter((recipient) => recipient.status === 'failed').length
    const skipped = recipients.filter((recipient) => recipient.status === 'skipped').length
    const optedOut = recipients.filter(
      (recipient) => recipient.status === 'skipped' && recipient.error === OPT_OUT_SKIP_REASON,
    ).length
    return {
      jobId: row.id,
      status: row.status,
      total: recipients.length,
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

  return {
    get,

    async detail(id: string): Promise<BroadcastV1ResponseDto> {
      return toDetail(await get(id))
    },

    async create(
      sessionId: string,
      input: ResolvedBroadcastInput,
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
      await repo.updateStatus(id, 'paused')
      return get(id)
    },

    async cancel(sessionId: string): Promise<BroadcastRow> {
      const row = await repo.findLatestBySession(sessionId)
      if (!row) throw new NotFoundError('Broadcast tidak ditemukan')
      if (!['scheduled', 'pending', 'running', 'paused'].includes(row.status)) {
        throw new ValidationError(`Broadcast sudah berstatus ${row.status}`)
      }
      await repo.updateStatus(row.id, 'cancelled')
      return get(row.id)
    },

    async setStatus(
      id: string,
      status: BroadcastRow['status'],
      patch: Partial<
        Pick<BroadcastRow, 'scheduledAt' | 'startedAt' | 'finishedAt' | 'pauseReason'>
      > = {},
    ): Promise<void> {
      await repo.updateStatus(id, status, patch)
    },

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
      id: number,
      status: BroadcastRecipientRow['status'],
      error: string | null = null,
    ): Promise<void> {
      await repo.updateRecipient(id, { status, error })
    },

    async countRunning(): Promise<number> {
      return repo.countByStatus('running')
    },
  }
}
