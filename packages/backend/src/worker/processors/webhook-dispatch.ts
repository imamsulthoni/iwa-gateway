import { and, asc, eq, lte } from 'drizzle-orm'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'

import type { Database } from '../../db/client.js'
import { webhookDeliveries, webhookEndpoints } from '../../db/schema.js'
import type { AppLogger } from '../../infra/logger.js'
import { incCounter } from '../../infra/metrics.js'
import { MAX_WEBHOOK_ATTEMPTS, retryDelayMs, signWebhook } from '../../modules/webhooks/delivery.js'

const REQUEST_TIMEOUT_MS = 10_000

export type WebhookDispatchDeps = {
  db: Database
  logger: AppLogger
  redis?: Redis
  fetch?: typeof fetch
  limit?: number
}

export function createWebhookDispatchProcessor(deps: WebhookDispatchDeps) {
  return async (_job?: Job): Promise<void> => {
    await dispatchDueWebhooks(deps)
  }
}

export async function dispatchDueWebhooks({
  db,
  logger,
  redis,
  fetch: fetchImpl = fetch,
  limit = 10,
}: WebhookDispatchDeps): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
      .where(
        and(
          eq(webhookDeliveries.status, 'pending'),
          lte(webhookDeliveries.nextAttemptAt, new Date()),
        ),
      )
      .orderBy(asc(webhookDeliveries.nextAttemptAt))
      .limit(limit)
      .for('update', { skipLocked: true })

    let delivered = 0
    let retried = 0
    let exhaustedTotal = 0
    for (const { delivery, endpoint } of rows) {
      if (!endpoint.active) {
        await tx
          .update(webhookDeliveries)
          .set({ status: 'failed', lastError: 'Endpoint webhook nonaktif' })
          .where(eq(webhookDeliveries.id, delivery.id))
        exhaustedTotal += 1
        continue
      }

      const body = JSON.stringify(delivery.payload)
      const startedAt = Date.now()
      let statusCode: number | null = null
      let error: string | null = null

      try {
        const response = await fetchImpl(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-event-id': delivery.id,
            'x-signature': signWebhook(endpoint.secret, body),
          },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
        statusCode = response.status
        if (!response.ok) error = `HTTP ${response.status}`
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Pengiriman webhook gagal'
      }

      const attempts = delivery.attempts + 1
      const failed = error !== null
      const exhausted = failed && attempts >= MAX_WEBHOOK_ATTEMPTS

      if (!failed) {
        delivered += 1
        await tx
          .update(webhookDeliveries)
          .set({ status: 'delivered', attempts, lastStatusCode: statusCode, lastError: null })
          .where(eq(webhookDeliveries.id, delivery.id))
      } else {
        if (exhausted) exhaustedTotal += 1
        else retried += 1
        await tx
          .update(webhookDeliveries)
          .set({
            status: exhausted ? 'failed' : 'pending',
            attempts,
            lastStatusCode: statusCode,
            lastError: error,
            nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
          })
          .where(eq(webhookDeliveries.id, delivery.id))
      }

      logger.info(
        {
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          eventType: delivery.eventType,
          attempts,
          statusCode,
          durationMs: Date.now() - startedAt,
          outboxLagMs: startedAt - delivery.createdAt.getTime(),
          result: failed ? (exhausted ? 'failed' : 'retry') : 'delivered',
        },
        'Webhook dispatch',
      )
    }

    incCounter(redis, 'webhookDelivered', delivered)
    incCounter(redis, 'webhookRetry', retried)
    incCounter(redis, 'webhookFailed', exhaustedTotal)

    return delivered
  })
}
