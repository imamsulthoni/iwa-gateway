import type { MessageDirection, MessageDto, MessageStatus, RoomMessageDto } from '@wa/shared'

import { newId } from '../../db/id.js'
import type { MessageRow } from '../../db/schema.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import { normalizePhone, toUserJid } from './phone.js'
import type { IncomingMessageValues, MessageCursor, MessagesRepository } from './repository.js'
import { mapBaileysStatus, shouldAdvanceStatus } from './status.js'

export type CreateOutgoingInput = {
  sessionId: string
  to: string
  clientRef: string
  text: string
  customerId?: string
  customerName?: string
  broadcastId?: string
  conversationId?: string
}

export type MessagesService = ReturnType<typeof createMessagesService>

export function encodeCursor(cursor: MessageCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  )
}

export function decodeCursor(value?: string): MessageCursor | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
    const [createdAt, id] = parsed
    if (typeof createdAt !== 'string' || typeof id !== 'string') return undefined
    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return undefined
    return { createdAt: date, id }
  } catch {
    return undefined
  }
}

export function toMessageDto(row: MessageRow & { salesName?: string | null }): MessageDto {
  return {
    id: row.id,
    sessionId: row.sessionId,
    to: row.toJid,
    clientRef: row.clientRef,
    body: row.body,
    status: row.status,
    waMessageId: row.waMessageId,
    error: row.error,
    customerName: row.customerName,
    salesName: row.salesName ?? null,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
  }
}

export function toRoomMessageDto(row: MessageRow): RoomMessageDto {
  return {
    id: row.id,
    conversationId: row.conversationId ?? '',
    sessionId: row.sessionId,
    direction: row.direction,
    type: row.type,
    body: row.body,
    status: row.status,
    clientRef: row.clientRef,
    waMessageId: row.waMessageId,
    createdAt: row.createdAt.toISOString(),
  }
}

function toPage(rows: {
  items: (MessageRow & { salesName?: string | null })[]
  nextCursor: MessageCursor | null
}): {
  items: MessageDto[]
  nextCursor: string | null
} {
  return {
    items: rows.items.map(toMessageDto),
    nextCursor: rows.nextCursor ? encodeCursor(rows.nextCursor) : null,
  }
}

export function createMessagesService(repo: MessagesRepository) {
  async function get(id: string): Promise<MessageRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Pesan tidak ditemukan')
    return row
  }

  return {
    get,

    async findByClientRef(sessionId: string, clientRef: string): Promise<MessageDto | null> {
      const row = await repo.findByClientRef(sessionId, clientRef)
      return row ? toMessageDto(row) : null
    },

    async createOutgoing(
      input: CreateOutgoingInput,
    ): Promise<{ message: MessageDto; duplicate: boolean }> {
      const phone = normalizePhone(input.to)
      const { row, duplicate } = await repo.insertIdempotent({
        id: newId(),
        sessionId: input.sessionId,
        clientRef: input.clientRef,
        direction: 'out',
        type: 'text',
        body: input.text,
        status: 'queued',
        toJid: toUserJid(phone),
        customerId: input.customerId ?? null,
        customerName: input.customerName ?? null,
        broadcastId: input.broadcastId ?? null,
        conversationId: input.conversationId ?? null,
      })
      return { message: toMessageDto(row), duplicate }
    },

    async ingestIncoming(
      sessionId: string,
      input: IncomingMessageValues,
    ): Promise<{ message: RoomMessageDto; duplicate: boolean }> {
      const { row, duplicate } = await repo.insertIncoming(sessionId, input)
      return { message: toRoomMessageDto(row), duplicate }
    },

    async listBySession(
      sessionId: string,
      limit: number,
      cursor?: string,
      direction?: MessageDirection,
    ): Promise<{ items: MessageDto[]; nextCursor: string | null }> {
      return toPage(
        await repo.listBySession(sessionId, limit, decodeCursor(cursor), direction),
      )
    },

    async listAll(
      limit: number,
      sessionId?: string,
      cursor?: string,
      direction?: MessageDirection,
    ): Promise<{ items: MessageDto[]; nextCursor: string | null }> {
      return toPage(await repo.listAll(limit, sessionId, decodeCursor(cursor), direction))
    },

    async markSent(id: string, waMessageId: string | null, raw?: unknown): Promise<void> {
      await repo.updateStatus(id, 'sent', {
        waMessageId,
        raw: raw ?? null,
        error: null,
        waTimestamp: new Date(),
      })
    },

    async markFailed(id: string, message: string): Promise<void> {
      await repo.updateStatus(id, 'failed', { error: message })
    },

    async applyStatusUpdate(
      sessionId: string,
      waMessageId: string,
      statusValue: number | string | null | undefined,
    ): Promise<{
      id: string
      clientRef: string | null
      toJid: string | null
      status: MessageStatus
    } | null> {
      const next = mapBaileysStatus(statusValue)
      if (!next) return null
      const row = await repo.findByWaMessageId(sessionId, waMessageId)
      if (!row) return null
      if (!shouldAdvanceStatus(row.status, next)) return null
      await repo.updateStatus(row.id, next)
      await repo.addStatusEvent(row.id, next)
      return { id: row.id, clientRef: row.clientRef, toJid: row.toJid, status: next }
    },

    async retry(id: string): Promise<MessageDto> {
      const row = await get(id)
      if (row.deletedAt) {
        throw new ValidationError('Pesan yang sudah dihapus tidak bisa dikirim ulang')
      }
      if (row.status !== 'failed') {
        throw new ValidationError('Hanya pesan berstatus gagal yang bisa dikirim ulang')
      }
      const requeued = await repo.requeueFailed(id)
      if (!requeued) {
        throw new ConflictError('Status pesan sudah berubah, muat ulang riwayat')
      }
      return toMessageDto({ ...row, status: 'queued', error: null })
    },

    async remove(id: string): Promise<void> {
      const removed = await repo.softDelete(id)
      if (!removed) throw new NotFoundError('Pesan tidak ditemukan')
    },

    async countToday(sessionId: string, since: Date): Promise<number> {
      return repo.countToday(sessionId, since)
    },

    async countTotal(sessionId?: string): Promise<number> {
      return repo.countTotal(sessionId)
    },

    async getRaw(sessionId: string, waMessageId: string): Promise<unknown> {
      const raw = await repo.findRawByWaMessageId(sessionId, waMessageId)
      return raw ?? null
    },
  }
}

export function assertStatus(value: string): MessageStatus {
  const mapped = mapBaileysStatus(value)
  if (!mapped) throw new ValidationError(`Status tidak dikenal: ${value}`)
  return mapped
}
