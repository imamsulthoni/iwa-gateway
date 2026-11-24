import type { ConversationDto, RoomMessageDto } from '@wbc/shared'

import type { ConversationRow } from '../../db/schema.js'
import { NotFoundError } from '../errors.js'
import { toRoomMessageDto } from '../messages/service.js'
import type { ConversationCursor, ConversationsRepository } from './repository.js'

export type ConversationsService = ReturnType<typeof createConversationsService>

function encodeCursor(cursor: ConversationCursor): string {
  return Buffer.from(JSON.stringify([cursor.lastMessageAt.toISOString(), cursor.id])).toString(
    'base64url',
  )
}

function decodeCursor(value?: string): ConversationCursor | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
    const [at, id] = parsed
    if (typeof at !== 'string' || typeof id !== 'string') return undefined
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return undefined
    return { lastMessageAt: date, id }
  } catch {
    return undefined
  }
}

export function toConversationDto(
  row: ConversationRow & { customerNames?: string | null },
): ConversationDto {
  return {
    id: row.id,
    sessionId: row.sessionId,
    waJid: row.waJid,
    waJidAlt: row.waJidAlt,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    unreadCount: row.unreadCount,
    customerNames: row.customerNames ?? null,
  }
}

export function createConversationsService(repo: ConversationsRepository) {
  async function get(id: string): Promise<ConversationRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Percakapan tidak ditemukan')
    return row
  }

  return {
    get,

    async findBySessionAndJid(sessionId: string, waJid: string): Promise<ConversationRow | null> {
      return repo.findBySessionAndJid(sessionId, waJid)
    },

    async findBySessionAndAddress(sessionId: string, jid: string): Promise<ConversationRow | null> {
      return repo.findBySessionAndAddress(sessionId, jid)
    },

    async listRooms(
      sessionId: string,
      limit: number,
      cursor?: string,
    ): Promise<{ items: ConversationDto[]; nextCursor: string | null }> {
      const page = await repo.listRooms(sessionId, limit, decodeCursor(cursor))
      return {
        items: page.items.map(toConversationDto),
        nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      }
    },

    async listMessages(
      conversationId: string,
      limit: number,
      cursor?: string,
    ): Promise<{ items: RoomMessageDto[]; nextCursor: string | null }> {
      await get(conversationId)
      const page = await repo.listMessages(conversationId, limit, decodeCursor(cursor))
      return {
        items: page.items.map(toRoomMessageDto),
        nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      }
    },

    async markRead(id: string): Promise<ConversationDto> {
      const conversation = await get(id)
      await repo.markRead(id)
      return toConversationDto({ ...conversation, unreadCount: 0 })
    },
  }
}
