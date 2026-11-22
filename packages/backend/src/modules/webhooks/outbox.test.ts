import { describe, expect, it, vi } from 'vitest'
import type { WebhookPayload } from '@wbc/shared'

import type { WebhookEndpointRow } from '../../db/schema.js'
import { createWebhookOutbox } from './outbox.js'
import type { WebhooksRepository } from './repository.js'

const PAYLOAD: WebhookPayload = {
  id: 'evt-1',
  type: 'message.received',
  session_id: 's1',
  data: {
    message_id: 'm1',
    conversation_id: 'c1',
    from: '628123@s.whatsapp.net',
    type: 'text',
    body: 'Halo',
    occurred_at: '2026-01-01T00:00:00.000Z',
  },
}

function endpoint(overrides: Partial<WebhookEndpointRow>): WebhookEndpointRow {
  return {
    id: 'w1',
    url: 'https://example.com/hook',
    secret: 'secret',
    events: ['message.received'],
    active: true,
    createdAt: new Date(),
    ...overrides,
  }
}

function createOutbox(rows: WebhookEndpointRow[]) {
  const createDeliveries = vi.fn(async () => undefined)
  const repo = {
    findActive: vi.fn(async () => rows),
    createDeliveries,
  } as unknown as WebhooksRepository
  return { outbox: createWebhookOutbox(repo), createDeliveries }
}

describe('webhook outbox', () => {
  it('membuat satu delivery per endpoint aktif yang subscribe', async () => {
    const { outbox, createDeliveries } = createOutbox([
      endpoint({ id: 'w1' }),
      endpoint({ id: 'w2', events: ['message.status'] }),
      endpoint({ id: 'w3', events: ['message.status', 'message.received'] }),
    ])

    await expect(outbox.record(PAYLOAD)).resolves.toBe(2)
    const [values] = createDeliveries.mock.calls[0] as unknown as [
      { endpointId: string; status: string; eventType: string }[],
    ]
    expect(values.map((value) => value.endpointId)).toEqual(['w1', 'w3'])
    expect(values[0]).toMatchObject({ status: 'pending', eventType: 'message.received' })
  })

  it('tidak membuat delivery saat tidak ada endpoint yang cocok', async () => {
    const { outbox, createDeliveries } = createOutbox([
      endpoint({ events: ['session.status'] }),
    ])

    await expect(outbox.record(PAYLOAD)).resolves.toBe(0)
    expect(createDeliveries).toHaveBeenCalledWith([])
  })

  it('mengenali tipe event broadcast', async () => {
    const payload: WebhookPayload = {
      id: 'evt-2',
      type: 'broadcast.recipient',
      session_id: 's1',
      data: {
        broadcast_id: 'b1',
        recipient_id: 1,
        to: '628123456789@s.whatsapp.net',
        phone: '628123456789',
        ref: 'crm-1',
        status: 'sent',
        message_id: 'm1',
        error: null,
        occurred_at: '2026-01-01T00:00:00.000Z',
      },
    }
    const { outbox, createDeliveries } = createOutbox([
      endpoint({ id: 'w1', events: ['broadcast.recipient'] }),
      endpoint({ id: 'w2', events: ['broadcast.status'] }),
    ])

    await expect(outbox.record(payload)).resolves.toBe(1)
    const [values] = createDeliveries.mock.calls[0] as unknown as [{ endpointId: string }[]]
    expect(values.map((value) => value.endpointId)).toEqual(['w1'])
  })
})