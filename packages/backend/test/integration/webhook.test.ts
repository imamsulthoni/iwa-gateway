import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { WebhookPayload } from '@wa/shared'

import { webhookDeliveries } from '../../src/db/schema.js'
import { createLogger } from '../../src/infra/logger.js'
import { signWebhook } from '../../src/modules/webhooks/delivery.js'
import { createWebhookOutbox } from '../../src/modules/webhooks/outbox.js'
import { createWebhooksRepository } from '../../src/modules/webhooks/repository.js'
import { createWebhooksService } from '../../src/modules/webhooks/service.js'
import { dispatchDueWebhooks } from '../../src/worker/processors/webhook-dispatch.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const PAYLOAD: WebhookPayload = {
  id: 'evt-1',
  type: 'message.received',
  session_id: 's1',
  data: {
    message_id: 'm1',
    conversation_id: 'c1',
    from: '628123456789@s.whatsapp.net',
    type: 'text',
    body: 'Halo',
    occurred_at: '2026-01-01T00:00:00.000Z',
  },
}

type ReceivedRequest = {
  eventId: string | undefined
  signature: string | undefined
  body: string
}

describeIntegration('integrasi webhook', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let server: Server
  let baseUrl: string
  let received: ReceivedRequest[]
  let statuses: number[]
  let delayMs: number

  const logger = () => createLogger('silent')
  const repository = () => createWebhooksRepository(connection.db)
  const service = () => createWebhooksService(repository())
  const outbox = () => createWebhookOutbox(repository())

  beforeAll(async () => {
    connection = await setupTestDb()
    server = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        void (async () => {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
          received.push({
            eventId: request.headers['x-event-id'] as string | undefined,
            signature: request.headers['x-signature'] as string | undefined,
            body: Buffer.concat(chunks).toString('utf8'),
          })
          response.statusCode = statuses.shift() ?? 200
          response.end('ok')
        })()
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
    received = []
    statuses = []
    delayMs = 0
  })

  async function createEndpoint(events: WebhookPayload['type'][] = ['message.received']) {
    return service().create({ url: `${baseUrl}/hook`, events })
  }

  async function makeDue() {
    await connection.db
      .update(webhookDeliveries)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(webhookDeliveries.status, 'pending'))
  }

  it('mengirim HMAC valid dengan X-Event-Id dari delivery', async () => {
    const endpoint = await createEndpoint()
    await outbox().record(PAYLOAD)
    const [delivery] = await connection.db.select().from(webhookDeliveries)

    await expect(
      dispatchDueWebhooks({ db: connection.db, logger: logger() }),
    ).resolves.toBe(1)

    expect(received).toHaveLength(1)
    expect(received[0]?.eventId).toBe(delivery?.id)
    expect(received[0]?.signature).toBe(signWebhook(endpoint.secret, received[0]?.body ?? ''))

    const [row] = await connection.db.select().from(webhookDeliveries)
    expect(row).toMatchObject({ status: 'delivered', attempts: 1, lastStatusCode: 200 })
  })

  it('retry 500 lalu sukses dengan event id dan signature yang sama', async () => {
    await createEndpoint()
    await outbox().record(PAYLOAD)
    statuses = [500, 200]

    await dispatchDueWebhooks({ db: connection.db, logger: logger() })
    let [row] = await connection.db.select().from(webhookDeliveries)
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastStatusCode: 500 })
    expect(row?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())

    await makeDue()
    await dispatchDueWebhooks({ db: connection.db, logger: logger() })

    ;[row] = await connection.db.select().from(webhookDeliveries)
    expect(row).toMatchObject({ status: 'delivered', attempts: 2, lastStatusCode: 200 })
    expect(received).toHaveLength(2)
    expect(received[1]?.eventId).toBe(received[0]?.eventId)
    expect(received[1]?.signature).toBe(received[0]?.signature)
  })

  it('timeout di-retry maksimal 3 percobaan lalu failed', async () => {
    await createEndpoint()
    await outbox().record(PAYLOAD)
    const fetchImpl = (async () => {
      throw new DOMException('timeout', 'TimeoutError')
    }) as typeof fetch

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await dispatchDueWebhooks({ db: connection.db, logger: logger(), fetch: fetchImpl })
      await makeDue()
    }

    const [row] = await connection.db.select().from(webhookDeliveries)
    expect(row).toMatchObject({ status: 'failed', attempts: 3, lastStatusCode: null })
    expect(row?.lastError).toContain('timeout')

    await expect(
      dispatchDueWebhooks({ db: connection.db, logger: logger(), fetch: fetchImpl }),
    ).resolves.toBe(0)
  })

  it('endpoint nonaktif tidak menerima delivery', async () => {
    await service().create({
      url: `${baseUrl}/hook`,
      events: ['message.received'],
      active: false,
    })

    await expect(outbox().record(PAYLOAD)).resolves.toBe(0)
    expect(await connection.db.select().from(webhookDeliveries)).toHaveLength(0)
  })

  it('log delivery hanya memuat milik endpoint yang diminta', async () => {
    const first = await createEndpoint()
    const second = await service().create({
      url: `${baseUrl}/second`,
      events: ['message.received'],
    })
    await outbox().record(PAYLOAD)

    const firstLog = await service().listDeliveries(first.id, 20)
    const secondLog = await service().listDeliveries(second.id, 20)
    expect(firstLog.items).toHaveLength(1)
    expect(secondLog.items).toHaveLength(1)
    expect(firstLog.items[0]?.id).not.toBe(secondLog.items[0]?.id)
    expect(firstLog.items[0]).not.toHaveProperty('secret')
  })

  it('dua worker paralel tidak mengirim delivery yang sama', async () => {
    await createEndpoint()
    await createEndpoint()
    await outbox().record(PAYLOAD)
    delayMs = 50

    await Promise.all([
      dispatchDueWebhooks({ db: connection.db, logger: logger() }),
      dispatchDueWebhooks({ db: connection.db, logger: logger() }),
    ])

    expect(received).toHaveLength(2)
    const rows = await connection.db.select().from(webhookDeliveries)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === 'delivered' && row.attempts === 1)).toBe(true)
  })
})