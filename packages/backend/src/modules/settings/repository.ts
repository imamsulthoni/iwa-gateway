import { eq, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { appSettings, users } from '../../db/schema.js'

export const MAX_SALES_KEY = 'max_sales'
export const DEFAULT_MIN_DELAY_KEY = 'default_min_delay'
export const DEFAULT_MAX_DELAY_KEY = 'default_max_delay'
export const DEFAULT_MAX_SALES = 10

export type SettingsRepository = ReturnType<typeof createSettingsRepository>

export function createSettingsRepository(db: Database) {
  return {
    async get(key: string): Promise<string | null> {
      const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
      return row?.value ?? null
    },

    async upsert(key: string, value: string): Promise<void> {
      const updatedAt = new Date()
      await db
        .insert(appSettings)
        .values({ key, value, updatedAt })
        .onDuplicateKeyUpdate({ set: { value, updatedAt } })
    },

    async countSales(): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.role, 'sales'))
      return Number(row?.count ?? 0)
    },
  }
}
