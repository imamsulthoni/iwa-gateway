import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'

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
    ): Promise<{
      items: (ConversationRow & { customerNames: string | null })[]
      nextCursor: ConversationCursor | null
    }> {
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

      const addresses = [
        ...new Set(items.flatMap((row) => [row.waJid, row.waJidAlt]).filter(Boolean)),
      ] as string[]
      // ponytail: match nama lewat nomor (to_jid), bukan conversation_id, karena
      // pesan broadcast tidak menyimpan conversation_id.
      const nameRows = addresses.length
        ? await db
            .select({
              toJid: messages.toJid,
              names: sql<
                string | null
              >`group_concat(distinct ${messages.customerName} order by ${messages.customerName} separator ', ')`,
            })
            .from(messages)
            .where(
              and(
                eq(messages.sessionId, sessionId),
                inArray(messages.toJid, addresses),
                isNotNull(messages.customerName),
                isNull(messages.deletedAt),
              ),
            )
            .groupBy(messages.toJid)
        : []
      const namesByAddress = new Map(nameRows.map((row) => [row.toJid, row.names]))

      return {
        items: items.map((row) => ({
          ...row,
          customerNames:
            namesByAddress.get(row.waJid) ??
            (row.waJidAlt ? namesByAddress.get(row.waJidAlt) : null) ??
            null,
        })),
        nextCursor,
      }
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
