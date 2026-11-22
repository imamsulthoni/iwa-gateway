import type { WebhookPayload } from '@wbc/shared'

import { newId } from '../../db/id.js'
import type { WebhooksRepository } from './repository.js'

export type WebhookOutbox = ReturnType<typeof createWebhookOutbox>

export function createWebhookOutbox(repo: WebhooksRepository) {
  return {
    async record(payload: WebhookPayload): Promise<number> {
      const endpoints = (await repo.findActive()).filter((endpoint) =>
        endpoint.events.includes(payload.type),
      )
      await repo.createDeliveries(
        endpoints.map((endpoint) => ({
          id: newId(),
          endpointId: endpoint.id,
          eventType: payload.type,
          payload,
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: new Date(),
        })),
      )
      return endpoints.length
    },
  }
}