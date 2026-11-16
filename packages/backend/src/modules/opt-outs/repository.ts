import { eq, inArray, sql } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import { optOuts, type OptOutRow } from '../../db/schema.js'

export type OptOutsRepository = ReturnType<typeof createOptOutsRepository>

export function createOptOutsRepository(db: Database) {
  return {
    async findByPhone(phoneE164: string): Promise<OptOutRow | null> {
      const [row] = await db.select().from(optOuts).where(eq(optOuts.phoneE164, phoneE164)).limit(1)
      return row ?? null
    },

    async findOptedOutPhones(phones: string[]): Promise<Set<string>> {
      if (phones.length === 0) return new Set()
      const rows = await db
        .select({ phone: optOuts.phoneE164 })
        .from(optOuts)
        .where(inArray(optOuts.phoneE164, phones))
      return new Set(rows.map((row) => row.phone))
    },

    async insertIfAbsent(values: typeof optOuts.$inferInsert): Promise<void> {
      await db
        .insert(optOuts)
        .values(values)
        .onDuplicateKeyUpdate({ set: { phoneE164: sql`${optOuts.phoneE164}` } })
    },
  }
}
