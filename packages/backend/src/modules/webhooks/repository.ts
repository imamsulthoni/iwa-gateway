import { and, desc, eq, lt, or } from 'drizzle-orm'

import type { Database } from '../../db/client.js'
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from '../../db/schema.js'

export type DeliveryCursor = {
  createdAt: Date
  id: string
}

export type WebhooksRepository = ReturnType<typeof createWebhooksRepository>

export function createWebhooksRepository(db: Database) {
  return {
    async findById(id: string): Promise<WebhookEndpointRow | null> {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, id))
        .limit(1)
      return row ?? null
    },

    async list(): Promise<WebhookEndpointRow[]> {
      return db.select().from(webhookEndpoints).orderBy(desc(webhookEndpoints.createdAt))
    },

    async findActive(): Promise<WebhookEndpointRow[]> {
      return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.active, true))
    },

    async create(values: typeof webhookEndpoints.$inferInsert): Promise<void> {
      await db.insert(webhookEndpoints).values(values)
    },

    async update(
      id: string,
      values: Partial<typeof webhookEndpoints.$inferInsert>,
    ): Promise<void> {
      await db.update(webhookEndpoints).set(values).where(eq(webhookEndpoints.id, id))
    },

    async remove(id: string): Promise<void> {
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id))
    },

    async createDeliveries(values: (typeof webhookDeliveries.$inferInsert)[]): Promise<void> {
      if (values.length === 0) return
      await db.insert(webhookDeliveries).values(values)
    },

    async listDeliveries(
      endpointId: string,
      limit: number,
      status?: WebhookDeliveryRow['status'],
      cursor?: DeliveryCursor,
    ): Promise<{ items: WebhookDeliveryRow[]; nextCursor: DeliveryCursor | null }> {
      const filters = [eq(webhookDeliveries.endpointId, endpointId)]
      if (status) filters.push(eq(webhookDeliveries.status, status))
      if (cursor) {
        filters.push(
          or(
            lt(webhookDeliveries.createdAt, cursor.createdAt),
            and(
              eq(webhookDeliveries.createdAt, cursor.createdAt),
              lt(webhookDeliveries.id, cursor.id),
            ),
          )!,
        )
      }

      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(and(...filters))
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(limit + 1)

      const items = rows.slice(0, limit)
      const last = items.at(-1)
      const nextCursor =
        rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null
      return { items, nextCursor }
    },
  }
}