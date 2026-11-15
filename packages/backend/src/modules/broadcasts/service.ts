import type { BroadcastCurrentDto, CreateBroadcastInput } from '@wa/shared'
import { isValidDelayRange } from '@wa/shared'

import { newId } from '../../db/id.js'
import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import { toUserJid } from '../messages/phone.js'
import type { BroadcastsRepository } from './repository.js'

export type BroadcastsService = ReturnType<typeof createBroadcastsService>

export type RecipientInput = {
  to: string
  name?: string
}

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

export function createBroadcastsService(repo: BroadcastsRepository) {
  async function get(id: string): Promise<BroadcastRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Broadcast tidak ditemukan')
    return row
  }

  function toCurrent(row: BroadcastRow, recipients: BroadcastRecipientRow[]): BroadcastCurrentDto {
    const sent = recipients.filter((recipient) => recipient.status === 'sent').length
    const failed = recipients.filter((recipient) => recipient.status === 'failed').length
    return {
      jobId: row.id,
      status: row.status,
      total: recipients.length,
      done: sent + failed,
      sent,
      failed,
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        to: recipient.toJid,
        name: recipient.name,
        status: recipient.status,
        error: recipient.error,
      })),
    }
  }

  return {
    get,

    async create(
      sessionId: string,
      input: CreateBroadcastInput,
    ): Promise<{ broadcast: BroadcastRow }> {
      if (!isValidDelayRange(input.minDelay, input.maxDelay)) {
        throw new ValidationError('Delay harus 10-600 detik dan max tidak boleh kurang dari min')
      }
      if (input.recipients.length === 0) {
        throw new ValidationError('Daftar penerima tidak boleh kosong')
      }

      const recipients = prepareRecipients(input.recipients).map((recipient) => ({
        ...recipient,
        status: 'pending' as const,
      }))

      const id = newId()
      await repo.createWithRecipients(
        {
          id,
          sessionId,
          name: `Broadcast ${input.referenceId}`,
          template: input.text,
          status: 'pending',
          minDelayMs: input.minDelay * 1000,
          maxDelayMs: input.maxDelay * 1000,
          referenceId: input.referenceId,
        },
        recipients,
      )
      return { broadcast: await get(id) }
    },

    async current(sessionId: string): Promise<BroadcastCurrentDto | null> {
      const row = await repo.findLatestBySession(sessionId)
      if (!row) return null
      return toCurrent(row, await repo.listRecipients(row.id))
    },

    async setStatus(id: string, status: BroadcastRow['status']): Promise<void> {
      await repo.updateStatus(id, status)
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
