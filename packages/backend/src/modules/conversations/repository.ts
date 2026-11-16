import { and, desc, eq, isNotNull, isNull, lt, ne, or } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { conversations, messages, type ConversationRow, type MessageRow } from '../../db/schema.js'

export type ConversationCursor = {
  lastMessageAt: Date
  id: string
}

export type ConversationsRepository = ReturnType<typeof createConversationsRepository>

export function createConversationsRepository(db: Database) {
  return {
    async findById(id: string): Promise<ConversationRow | null> {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1)
      return row ?? null
    },

    async findBySessionAndJid(sessionId: string, waJid: string): Promise<ConversationRow | null> {
      const [row] = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.sessionId, sessionId), eq(conversations.waJid, waJid)))
        .limit(1)
      return row ?? null
    },

    async findBySessionAndAddress(sessionId: string, jid: string): Promise<ConversationRow | null> {
      const [row] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.sessionId, sessionId),
            or(eq(conversations.waJid, jid), eq(conversations.waJidAlt, jid)),
          ),
        )
        .limit(1)
      return row ?? null
    },

    async listRooms(
      sessionId: string,
      limit: number,
      cursor?: ConversationCursor,
    ): Promise<{ items: ConversationRow[]; nextCursor: ConversationCursor | null }> {
      const condition = cursor
        ? and(
            eq(conversations.sessionId, sessionId),
            or(
              lt(conversations.lastMessageAt, cursor.lastMessageAt),
              and(
                eq(conversations.lastMessageAt, cursor.lastMessageAt),
                lt(conversations.id, cursor.id),
              ),
            ),
          )
        : and(eq(conversations.sessionId, sessionId), isNotNull(conversations.lastMessageAt))

      const rows = await db
        .select()
        .from(conversations)
        .where(condition)
        .orderBy(desc(conversations.lastMessageAt), desc(conversations.id))
        .limit(limit + 1)

      const items = rows.slice(0, limit)
      const last = items.at(-1)
      const nextCursor =
        rows.length > limit && last?.lastMessageAt
          ? { lastMessageAt: last.lastMessageAt, id: last.id }
          : null
      return { items, nextCursor }
    },

    async listMessages(
      conversationId: string,
      limit: number,
      cursor?: ConversationCursor,
    ): Promise<{ items: MessageRow[]; nextCursor: ConversationCursor | null }> {
      const base = and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt))
      const condition = cursor
        ? and(
            base,
            or(
              lt(messages.createdAt, cursor.lastMessageAt),
              and(eq(messages.createdAt, cursor.lastMessageAt), lt(messages.id, cursor.id)),
            ),
          )
        : base

      const rows = await db
        .select()
        .from(messages)
        .where(condition)
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(limit + 1)

      const items = rows.slice(0, limit)
      const last = items.at(-1)
      const nextCursor =
        rows.length > limit && last ? { lastMessageAt: last.createdAt, id: last.id } : null
      return { items, nextCursor }
    },

    async markRead(id: string): Promise<number> {
      return db.transaction(async (tx) => {
        await tx.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id))
        const [result] = await tx
          .update(messages)
          .set({ status: 'read' })
          .where(
            and(
              eq(messages.conversationId, id),
              eq(messages.direction, 'in'),
              ne(messages.status, 'read'),
            ),
          )
        return result.affectedRows
      })
    },
  }
}
