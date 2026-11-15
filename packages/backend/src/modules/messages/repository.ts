import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { messages, messageStatusEvents, type MessageRow } from '../../db/schema.js'
import { isDuplicateKeyError } from '../db-errors.js'

export type MessageCursor = {
  createdAt: Date
  id: string
}

export type MessagesRepository = ReturnType<typeof createMessagesRepository>

export function createMessagesRepository(db: Database) {
  async function findById(id: string): Promise<MessageRow | null> {
    const [row] = await db.select().from(messages).where(eq(messages.id, id)).limit(1)
    return row ?? null
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
      if (!isDuplicateKeyError(error) || !values.referenceId) throw error
      const [existing] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.sessionId, values.sessionId),
            eq(messages.referenceId, values.referenceId),
          ),
        )
        .limit(1)
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
    insertIdempotent,

    async findByWaMessageId(sessionId: string, waMessageId: string): Promise<MessageRow | null> {
      const [row] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.sessionId, sessionId), eq(messages.waMessageId, waMessageId)))
        .limit(1)
      return row ?? null
    },

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
    ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
      return listPage(
        and(eq(messages.sessionId, sessionId), isNull(messages.deletedAt)),
        limit,
        cursor,
      )
    },

    async listAll(
      limit: number,
      sessionId?: string,
      cursor?: MessageCursor,
    ): Promise<{ items: MessageRow[]; nextCursor: MessageCursor | null }> {
      const base = sessionId
        ? and(isNull(messages.deletedAt), eq(messages.sessionId, sessionId))
        : and(isNull(messages.deletedAt))
      return listPage(base, limit, cursor)
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
