import { and, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { newId } from '../../db/id.js'
import { conversations, messages, messageStatusEvents, type MessageRow } from '../../db/schema.js'
import { isDuplicateKeyError } from '../db-errors.js'

export type MessageCursor = {
  createdAt: Date
  id: string
}

export type IncomingMessageValues = {
  waJid: string
  waJidAlt: string | null
  waMessageId: string
  type: string
  body: string | null
  raw: unknown
  waTimestamp: Date | null
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>

export function createMessagesRepository(db: Database) {
  async function findById(id: string): Promise<MessageRow | null> {
    const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1)
    return row ?? null
  }

  async function findByClientRef(sessionId: string, clientRef: string): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.clientRef, clientRef)))
      .limit(1)
    return row ?? null
  }

  async function findByWaMessageId(
    sessionId: string,
    waMessageId: string,
  ): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), eq(messages.waMessageId, waMessageId)))
      .limit(1)
    return row ?? null
  }

  async function insertIncoming(
    sessionId: string,
    input: IncomingMessageValues,
  ): Promise<{ row: MessageRow; duplicate: boolean }> {
    const existing = await findByWaMessageId(sessionId, input.waMessageId)
    if (existing) return { row: existing, duplicate: true }

    try {
      return await db.transaction(async (tx) => {
        const at = input.waTimestamp ?? new Date()
        const addresses = [input.waJid, input.waJidAlt].filter((jid): jid is string => Boolean(jid))
        const [existing] = await tx
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.sessionId, sessionId),
              or(
                inArray(conversations.waJid, addresses),
                inArray(conversations.waJidAlt, addresses),
              ),
            ),
          )
          .limit(1)

        // LID menang sebagai JID kanonis; room yang sebelumnya memakai PN
        // dipindahkan ke LID saat PN dan LID pertama kali terlihat bersama.
        const waJid = input.waJid.endsWith('@lid') || !existing ? input.waJid : existing.waJid
        const waJidAlt = input.waJidAlt ?? existing?.waJidAlt ?? null

        await tx
          .insert(conversations)
          .values({
            id: existing?.id ?? newId(),
            sessionId,
            waJid,
            waJidAlt,
            lastMessageAt: at,
            unreadCount: 1,
          })
          .onDuplicateKeyUpdate({
            set: {
              waJid,
              waJidAlt,
              lastMessageAt: at,
              unreadCount: sql`${conversations.unreadCount} + 1`,
            },
          })

        const [conversation] = await tx
          .select()
          .from(conversations)
          .where(and(eq(conversations.sessionId, sessionId), eq(conversations.waJid, waJid)))
          .limit(1)
        if (!conversation) throw new Error('Percakapan gagal dibuat')

        const id = newId()
        await tx.insert(messages).values({
          id,
          sessionId,
          conversationId: conversation.id,
          waMessageId: input.waMessageId,
          direction: 'in',
          type: input.type,
          body: input.body,
          raw: input.raw,
          status: 'delivered',
          waTimestamp: at,
        })
        const [row] = await tx.select().from(messages).where(eq(messages.id, id)).limit(1)
        if (!row) throw new Error('Pesan masuk gagal dibaca setelah insert')
        return { row, duplicate: false }
      })
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error
      const raced = await findByWaMessageId(sessionId, input.waMessageId)
      if (!raced) throw error
      return { row: raced, duplicate: true }
    }
  }

  async function insertIdempotent(
    values: typeof messages.$inferInsert,
  ): Promise<{ row: MessageRow; duplicate: boolean }> {
    try {
      await db.insert(messages).values(values)
      const row = await findById(values.id)
      if (!row) throw new Error('Pesan gagal dibaca setelah insert')
      return { row, duplicate: false }
    } catch (error) {
      if (!isDuplicateKeyError(error) || !values.clientRef) throw error
      const existing = await findByClientRef(values.sessionId, values.clientRef)
      if (!existing) throw error
      return { row: existing, duplicate: true }
    }
  }

  function cursorCondition(cursor: MessageCursor) {
    return or(
      lt(messages.createdAt, cursor.createdAt),
      and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)),
    )
  }

  async function listPage(
    where: ReturnType<typeof and>,
    limit: number,
    cursor?: MessageCursor,
  ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
    const condition = cursor ? and(where, cursorCondition(cursor)) : where
    const rows = await db
      .select()
      .from(messages)
      .where(condition)
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1)

    const items = rows.slice(0, limit)
    const last = items.at(-1)
    const nextCursor =
      rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null
    return { items, nextCursor }
  }

  return {
    findById,
    findByClientRef,
    insertIdempotent,
    insertIncoming,
    findByWaMessageId,

    async findRawByWaMessageId(sessionId: string, waMessageId: string): Promise<unknown> {
      const [row] = await db
        .select({ raw: messages.raw })
        .from(messages)
        .where(and(eq(messages.sessionId, sessionId), eq(messages.waMessageId, waMessageId)))
        .limit(1)
      return row?.raw ?? null
    },

    async listBySession(
      sessionId: string,
      limit: number,
      cursor?: MessageCursor,
      direction?: MessageRow['direction'],
    ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
      const conditions = [eq(messages.sessionId, sessionId), isNull(messages.deletedAt)]
      if (direction) conditions.push(eq(messages.direction, direction))
      return listPage(and(...conditions), limit, cursor)
    },

    async listAll(
      limit: number,
      sessionId?: string,
      cursor?: MessageCursor,
      direction?: MessageRow['direction'],
    ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
      const conditions = [isNull(messages.deletedAt)]
      if (sessionId) conditions.push(eq(messages.sessionId, sessionId))
      if (direction) conditions.push(eq(messages.direction, direction))
      return listPage(and(...conditions), limit, cursor)
    },

    async listByConversation(
      conversationId: string,
      limit: number,
      cursor?: MessageCursor,
    ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
      return listPage(
        and(eq(messages.conversationId, conversationId), isNull(messages.deletedAt)),
        limit,
        cursor,
      )
    },

    async markConversationRead(conversationId: string): Promise<number> {
      const [result] = await db
        .update(messages)
        .set({ status: 'read' })
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.direction, 'in'),
            ne(messages.status, 'read'),
          ),
        )
      return result.affectedRows
    },

    async updateStatus(
      id: string,
      status: MessageRow['status'],
      extra: Partial<typeof messages.$inferInsert> = {},
    ): Promise<void> {
      await db
        .update(messages)
        .set({ status, ...extra })
        .where(eq(messages.id, id))
    },

    async addStatusEvent(messageId: string, status: string): Promise<void> {
      await db.insert(messageStatusEvents).values({ messageId, status })
    },

    async requeueFailed(id: string): Promise<boolean> {
      const [result] = await db
        .update(messages)
        .set({ status: 'queued', error: null })
        .where(and(eq(messages.id, id), eq(messages.status, 'failed'), isNull(messages.deletedAt)))
      return result.affectedRows > 0
    },

    async softDelete(id: string): Promise<boolean> {
      const [result] = await db
        .update(messages)
        .set({ deletedAt: new Date() })
        .where(and(eq(messages.id, id), isNull(messages.deletedAt)))
      return result.affectedRows > 0
    },

    async countToday(sessionId: string, since: Date): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.sessionId, sessionId),
            gte(messages.createdAt, since),
            inArray(messages.status, ['sent', 'delivered', 'read']),
            isNull(messages.deletedAt),
          ),
        )
      return Number(row?.count ?? 0)
    },

    async countTodayAll(since: Date): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            gte(messages.createdAt, since),
            inArray(messages.status, ['sent', 'delivered', 'read']),
            isNull(messages.deletedAt),
          ),
        )
      return Number(row?.count ?? 0)
    },

    async countTotal(sessionId?: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          sessionId
            ? and(isNull(messages.deletedAt), eq(messages.sessionId, sessionId))
            : isNull(messages.deletedAt),
        )
      return Number(row?.count ?? 0)
    },
  }
}
