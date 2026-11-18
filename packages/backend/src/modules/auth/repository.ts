import { and, eq, gt, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import {
  userSessions,
  users,
  waSessions,
  type UserRow,
  type WaSessionRow,
} from '../../db/schema.js'

export type AuthTokenRecord = {
  tokenHash: string
  expiresAt: Date
  user: UserRow
}

export type AuthRepository = ReturnType<typeof createAuthRepository>

export function createAuthRepository(db: Database) {
  return {
    async findUserByPhone(phoneNumber: string): Promise<UserRow | null> {
      const [row] = await db.select().from(users).where(eq(users.phoneNumber, phoneNumber)).limit(1)
      return row ?? null
    },

    async findUserById(id: string): Promise<UserRow | null> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
      return row ?? null
    },

    async countSales(): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, 'sales'))
      return Number(row?.count ?? 0)
    },

    async insertUser(values: typeof users.$inferInsert): Promise<void> {
      await db.insert(users).values(values)
    },

    async deleteUser(id: string): Promise<void> {
      await db.delete(users).where(eq(users.id, id))
    },

    async insertToken(values: typeof userSessions.$inferInsert): Promise<void> {
      await db.insert(userSessions).values(values)
    },

    async findToken(tokenHash: string): Promise<AuthTokenRecord | null> {
      const [row] = await db
        .select({ tokenHash: userSessions.tokenHash, expiresAt: userSessions.expiresAt, user: users })
        .from(userSessions)
        .innerJoin(users, eq(userSessions.userId, users.id))
        .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date())))
        .limit(1)
      return row ?? null
    },

    async revokeToken(tokenHash: string): Promise<void> {
      await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash))
    },

    async revokeTokensForUser(userId: string): Promise<void> {
      await db.delete(userSessions).where(eq(userSessions.userId, userId))
    },

    async findOwnedSession(userId: string): Promise<WaSessionRow | null> {
      const [row] = await db
        .select()
        .from(waSessions)
        .where(eq(waSessions.ownerUserId, userId))
        .limit(1)
      return row ?? null
    },
  }
}
