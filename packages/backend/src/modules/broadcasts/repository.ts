import { desc, eq, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import {
  broadcastRecipients,
  broadcasts,
  type BroadcastRecipientRow,
  type BroadcastRow,
} from '../../db/schema.js'

export type BroadcastsRepository = ReturnType<typeof createBroadcastsRepository>

export function createBroadcastsRepository(db: Database) {
  return {
    async createWithRecipients(
      values: typeof broadcasts.$inferInsert,
      recipients: Omit<typeof broadcastRecipients.$inferInsert, 'broadcastId'>[],
    ): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.insert(broadcasts).values(values)
        if (recipients.length > 0) {
          await tx
            .insert(broadcastRecipients)
            .values(recipients.map((recipient) => ({ ...recipient, broadcastId: values.id })))
        }
      })
    },

    async findById(id: string): Promise<BroadcastRow | null> {
      const [row] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1)
      return row ?? null
    },

    async findLatestBySession(sessionId: string): Promise<BroadcastRow | null> {
      const [row] = await db
        .select()
        .from(broadcasts)
        .where(eq(broadcasts.sessionId, sessionId))
        .orderBy(desc(broadcasts.createdAt))
        .limit(1)
      return row ?? null
    },

    async listRecipients(broadcastId: string): Promise<BroadcastRecipientRow[]> {
      return db
        .select()
        .from(broadcastRecipients)
        .where(eq(broadcastRecipients.broadcastId, broadcastId))
        .orderBy(broadcastRecipients.id)
    },

    async updateStatus(id: string, status: BroadcastRow['status']): Promise<void> {
      await db
        .update(broadcasts)
        .set({ status, updatedAt: new Date() })
        .where(eq(broadcasts.id, id))
    },

    async updateRecipient(
      id: number,
      values: Partial<typeof broadcastRecipients.$inferInsert>,
    ): Promise<void> {
      await db.update(broadcastRecipients).set(values).where(eq(broadcastRecipients.id, id))
    },

    async countByStatus(status: BroadcastRow['status']): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(broadcasts)
        .where(eq(broadcasts.status, status))
      return Number(row?.count ?? 0)
    },
  }
}
