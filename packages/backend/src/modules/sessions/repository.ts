import { and, desc, eq, getTableColumns, inArray, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { users, waSessions, type WaSessionRow } from '../../db/schema.js'

export type SessionWithOwner = WaSessionRow & { salesName: string | null }

export type SessionsRepository = ReturnType<typeof createSessionsRepository>

export function createSessionsRepository(db: Database) {
  function selectWithOwner() {
    return db
      .select({ ...getTableColumns(waSessions), salesName: users.name })
      .from(waSessions)
      .leftJoin(users, eq(waSessions.ownerUserId, users.id))
  }

  return {
    async insert(values: typeof waSessions.$inferInsert): Promise<void> {
      await db.insert(waSessions).values(values)
    },

    async findById(id: string): Promise<SessionWithOwner | null> {
      const [row] = await selectWithOwner().where(eq(waSessions.id, id)).limit(1)
      return row ?? null
    },

    async findByPublicId(publicId: string): Promise<SessionWithOwner | null> {
      const [row] = await selectWithOwner().where(eq(waSessions.publicId, publicId)).limit(1)
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

    async list(limit = 50, ownerUserId?: string): Promise<SessionWithOwner[]> {
      const query = ownerUserId
        ? selectWithOwner().where(eq(waSessions.ownerUserId, ownerUserId))
        : selectWithOwner()
      return query.orderBy(desc(waSessions.createdAt)).limit(limit)
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

    async listByStatus(status: WaSessionRow['status']): Promise<WaSessionRow[]> {
      return db.select().from(waSessions).where(eq(waSessions.status, status))
    },

    /**
     * Turunkan status sesi yang socket-nya berhenti ke `disconnected`, tanpa
     * menimpa status terminal seperti `logged_out`. Dipakai saat shutdown /
     * stop agar API tidak meloloskan pesan untuk sesi tanpa socket.
     */
    async markDisconnectedIfLive(id: string): Promise<boolean> {
      const [result] = await db
        .update(waSessions)
        .set({ status: 'disconnected', updatedAt: new Date() })
        .where(and(eq(waSessions.id, id), inArray(waSessions.status, ['connected', 'connecting'])))
      return result.affectedRows > 0
    },
  }
}
