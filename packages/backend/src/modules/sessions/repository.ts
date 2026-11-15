import { and, desc, eq, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { waSessions, type WaSessionRow } from '../../db/schema.js'

export type SessionsRepository = ReturnType<typeof createSessionsRepository>

export function createSessionsRepository(db: Database) {
  return {
    async insert(values: typeof waSessions.$inferInsert): Promise<void> {
      await db.insert(waSessions).values(values)
    },

    async findById(id: string): Promise<WaSessionRow | null> {
      const [row] = await db.select().from(waSessions).where(eq(waSessions.id, id)).limit(1)
      return row ?? null
    },

    async findByPublicId(publicId: string): Promise<WaSessionRow | null> {
      const [row] = await db
        .select()
        .from(waSessions)
        .where(eq(waSessions.publicId, publicId))
        .limit(1)
      return row ?? null
    },

    async findByPhone(phoneNumber: string): Promise<WaSessionRow | null> {
      const [row] = await db
        .select()
        .from(waSessions)
        .where(eq(waSessions.phoneNumber, phoneNumber))
        .limit(1)
      return row ?? null
    },

    async list(limit = 50): Promise<WaSessionRow[]> {
      return db.select().from(waSessions).orderBy(desc(waSessions.createdAt)).limit(limit)
    },

    async update(id: string, values: Partial<typeof waSessions.$inferInsert>): Promise<void> {
      await db
        .update(waSessions)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(waSessions.id, id))
    },

    async remove(id: string): Promise<void> {
      await db.delete(waSessions).where(eq(waSessions.id, id))
    },

    async countByStatus(status: WaSessionRow['status']): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(waSessions)
        .where(eq(waSessions.status, status))
      return Number(row?.count ?? 0)
    },

    async listStartable(): Promise<WaSessionRow[]> {
      return db
        .select()
        .from(waSessions)
        .where(
          and(
            sql`${waSessions.status} in ('created', 'connecting', 'connected', 'disconnected', 'qr_pending')`,
          ),
        )
    },
  }
}
