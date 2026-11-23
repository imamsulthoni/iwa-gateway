import { describe, expect, it } from 'vitest'

import { authMeSchema, loginResponseSchema, loginSchema } from './auth.js'
import { broadcastV1Schema, createBroadcastSchema } from './broadcast.js'
import { conversationListSchema, conversationSchema, roomMessageSchema } from './conversation.js'
import { sseEventSchema } from './event.js'
import {
  crossSessionMessageQuerySchema,
  messageQuerySchema,
  retryMessageResponseSchema,
  sendMessageSchema,
  sendMessageV1Schema,
} from './message.js'
import { createOptOutSchema, optOutSchema } from './opt-out.js'
import { paginationQuerySchema } from './pagination.js'
import {
  attachSalesSchema,
  createSessionSchema,
  publicIdSchema,
  resetSalesPinSchema,
} from './session.js'
import { settingsSchema, updateSettingsSchema } from './settings.js'
import { statsSchema } from './stats.js'
import { webhookPayloadSchema } from './webhook.js'

describe('kontrak sesi', () => {
  it('menerima input minimal', () => {
    expect(createSessionSchema.parse({ label: 'Sales A' })).toEqual({
      label: 'Sales A',
      mode: 'qr',
    })
  })

  it('menolak public_id tidak valid', () => {
    expect(publicIdSchema.safeParse('sales a').success).toBe(false)
    expect(publicIdSchema.safeParse('sales-a_1').success).toBe(true)
  })

  it('menolak nomor non-digit', () => {
    expect(
      createSessionSchema.safeParse({ label: 'A', mode: 'pairing', phoneNumber: '+62 812' })
        .success,
    ).toBe(false)
  })

  it('mewajibkan salesName dan PIN bersama dengan nomor', () => {
    const base = { label: 'Sales A', phoneNumber: '628123456789' }
    expect(createSessionSchema.safeParse({ ...base, salesName: 'Budi', pin: '1234' }).success).toBe(
      true,
    )
    expect(createSessionSchema.safeParse({ ...base, salesName: 'Budi' }).success).toBe(false)
    expect(createSessionSchema.safeParse({ ...base, pin: '1234' }).success).toBe(false)
    expect(
      createSessionSchema.safeParse({ label: 'Sales A', salesName: 'Budi', pin: '1234' }).success,
    ).toBe(false)
  })

  it('menolak PIN bukan 4-8 digit angka pada pembuatan sesi', () => {
    const base = { label: 'Sales A', phoneNumber: '628123456789', salesName: 'Budi' }
    for (const pin of ['123', '123456789', '12a4']) {
      expect(createSessionSchema.safeParse({ ...base, pin }).success).toBe(false)
    }
  })

  it('memvalidasi kontrak reset PIN dan tautkan sales', () => {
    expect(resetSalesPinSchema.safeParse({ pin: '1234' }).success).toBe(true)
    expect(resetSalesPinSchema.safeParse({ pin: '123' }).success).toBe(false)
    expect(attachSalesSchema.safeParse({ salesName: 'Budi', pin: '123456' }).success).toBe(true)
    expect(attachSalesSchema.safeParse({ salesName: '', pin: '123456' }).success).toBe(false)
    expect(attachSalesSchema.safeParse({ salesName: 'Budi', pin: '123456789' }).success).toBe(false)
  })
})

describe('kontrak pesan', () => {
  it('menolak pesan kosong', () => {
    expect(
      sendMessageSchema.safeParse({ to: '62812345678', clientRef: 'r1', text: '' }).success,
    ).toBe(false)
  })

  it('menerima pesan dengan field opsional', () => {
    const parsed = sendMessageSchema.parse({
      to: '62812345678',
      clientRef: 'r1',
      text: 'Halo',
      customerId: 'c1',
      customerName: 'Budi',
    })
    expect(parsed.customerName).toBe('Budi')
  })

  it('membungkus pesan hasil kirim ulang', () => {
    const message = {
      id: 'm1',
      sessionId: 's1',
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'queued',
      waMessageId: null,
      error: null,
      customerName: null,
      salesName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    expect(retryMessageResponseSchema.safeParse({ message }).success).toBe(true)
    expect(retryMessageResponseSchema.safeParse({ message: { id: 'm1' } }).success).toBe(false)
  })

  it('memfilter arah pesan lewat query opsional', () => {
    expect(messageQuerySchema.parse({}).direction).toBeUndefined()
    expect(messageQuerySchema.parse({ direction: 'out' }).direction).toBe('out')
    expect(crossSessionMessageQuerySchema.parse({ limit: '10', direction: 'in' })).toMatchObject({
      limit: 10,
      direction: 'in',
    })
    expect(messageQuerySchema.safeParse({ direction: 'both' }).success).toBe(false)
    expect(crossSessionMessageQuerySchema.safeParse({ direction: 'up' }).success).toBe(false)
  })

  it('mewajibkan sessionId berupa UUID pada pesan v1', () => {
    const body = {
      to: '628123456789',
      text: 'Halo',
      clientRef: 'ref-1',
      sessionId: '01a1ddfa-295a-7557-9bd3-00293fdc047b',
    }
    expect(sendMessageV1Schema.safeParse(body).success).toBe(true)
    expect(sendMessageV1Schema.safeParse({ ...body, sessionId: 'sales-a' }).success).toBe(false)
    expect(crossSessionMessageQuerySchema.safeParse({ sessionId: body.sessionId }).success).toBe(
      true,
    )
    expect(crossSessionMessageQuerySchema.safeParse({ sessionId: 'sales-a' }).success).toBe(false)
  })
})

describe('kontrak auth', () => {
  it('menerima nomor dan PIN valid', () => {
    expect(loginSchema.parse({ phoneNumber: '628123456789', pin: '1234' })).toEqual({
      phoneNumber: '628123456789',
      pin: '1234',
    })
    expect(loginSchema.safeParse({ phoneNumber: '628123456789', pin: '12345678' }).success).toBe(
      true,
    )
  })

  it('menolak PIN 3 digit, 9 digit, dan huruf', () => {
    for (const pin of ['123', '123456789', '12a4', '12 34']) {
      expect(loginSchema.safeParse({ phoneNumber: '628123456789', pin }).success).toBe(false)
    }
  })

  it('menolak nomor berspasi atau non-digit', () => {
    for (const phoneNumber of ['+62 812', '6281 2345', '0812-3456']) {
      expect(loginSchema.safeParse({ phoneNumber, pin: '1234' }).success).toBe(false)
    }
  })

  it('membentuk respons login dan /auth/me dua mode', () => {
    const user = {
      id: 'u1',
      name: 'Sales A',
      phoneNumber: '628123456789',
      role: 'sales',
      active: true,
    }

    expect(
      loginResponseSchema.safeParse({ token: 't', expiresAt: '2026-12-01T00:00:00.000Z', user })
        .success,
    ).toBe(true)
    expect(authMeSchema.safeParse({ mode: 'admin', user: null }).success).toBe(true)
    expect(authMeSchema.safeParse({ mode: 'sales', user }).success).toBe(true)
    expect(authMeSchema.safeParse({ mode: 'sales', user: null }).success).toBe(true)
    expect(authMeSchema.safeParse({ mode: 'lainnya', user: null }).success).toBe(false)
  })
})

describe('kontrak broadcast', () => {
  it('menolak daftar penerima kosong', () => {
    expect(
      createBroadcastSchema.safeParse({
        recipients: [],
        text: 'Halo',
        minDelay: 10,
        maxDelay: 20,
        clientRef: 'b1',
      }).success,
    ).toBe(false)
  })

  it('menolak max lebih kecil dari min', () => {
    expect(
      createBroadcastSchema.safeParse({
        recipients: [{ to: '62812345678' }],
        text: 'Halo',
        minDelay: 60,
        maxDelay: 30,
        clientRef: 'b1',
      }).success,
    ).toBe(false)
  })

  it('menerima jadwal UTC opsional pada broadcast v1', () => {
    const body = {
      sessionId: '01a1ddfa-295a-7557-9bd3-00293fdc047b',
      recipients: [{ to: '62812345678' }],
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'b1',
    }
    expect(broadcastV1Schema.safeParse(body).success).toBe(true)
    expect(broadcastV1Schema.safeParse({ ...body, sessionId: 'sales-a' }).success).toBe(false)
    expect(
      broadcastV1Schema.safeParse({ ...body, scheduledAt: '2026-11-20T10:00:00.000Z' }).success,
    ).toBe(true)
    expect(broadcastV1Schema.safeParse({ ...body, scheduledAt: '20 Nov 2026 10:00' }).success).toBe(
      false,
    )
  })
})

describe('kontrak percakapan', () => {
  it('memvalidasi room dan pesan room', () => {
    const conversation = {
      id: 'c1',
      sessionId: 's1',
      waJid: '628123456789@s.whatsapp.net',
      waJidAlt: null,
      lastMessageAt: '2026-11-16T10:00:00.000Z',
      unreadCount: 2,
    }
    expect(conversationSchema.safeParse(conversation).success).toBe(true)
    expect(
      conversationListSchema.safeParse({ items: [conversation], nextCursor: null }).success,
    ).toBe(true)
    expect(
      roomMessageSchema.safeParse({
        id: 'm1',
        conversationId: 'c1',
        sessionId: 's1',
        direction: 'in',
        type: 'image',
        body: 'Gambar',
        status: 'delivered',
        clientRef: null,
        waMessageId: 'wa-1',
        createdAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(true)
  })
})

describe('kontrak event SSE', () => {
  it('menerima event pesan masuk dan menolak event tak dikenal', () => {
    const message = {
      id: 'm1',
      conversationId: 'c1',
      sessionId: 's1',
      direction: 'in',
      type: 'text',
      body: 'Halo',
      status: 'delivered',
      clientRef: null,
      waMessageId: 'wa-1',
      createdAt: '2026-11-16T10:00:00.000Z',
    }
    expect(
      sseEventSchema.safeParse({ id: 'e1', event: 'message.received', data: { message } }).success,
    ).toBe(true)
    expect(sseEventSchema.safeParse({ id: 'e1', event: 'contact.updated', data: {} }).success).toBe(
      false,
    )
  })
})

describe('kontrak webhook', () => {
  it('memvalidasi payload status pesan dan menolak tipe lain', () => {
    const payload = {
      id: 'evt-1',
      type: 'message.status',
      session_id: 's1',
      data: {
        message_id: 'm1',
        client_ref: 'order-1',
        to: '628123456789@s.whatsapp.net',
        phone: '628123456789',
        status: 'delivered',
        occurred_at: '2026-11-16T10:00:00.000Z',
      },
    }
    expect(webhookPayloadSchema.safeParse(payload).success).toBe(true)
    expect(webhookPayloadSchema.safeParse({ ...payload, type: 'optout' }).success).toBe(false)
  })

  it('memvalidasi payload broadcast penerima dan status', () => {
    const recipient = {
      id: 'evt-2',
      type: 'broadcast.recipient',
      session_id: 's1',
      data: {
        broadcast_id: 'b1',
        recipient_id: 42,
        to: '628123456789@s.whatsapp.net',
        phone: '628123456789',
        ref: 'crm-8821',
        status: 'failed',
        message_id: 'm1',
        error: 'connection closed',
        occurred_at: '2026-11-22T03:00:05.000Z',
      },
    }
    const status = {
      id: 'evt-3',
      type: 'broadcast.status',
      session_id: 's1',
      data: {
        broadcast_id: 'b1',
        status: 'paused',
        total: 2,
        sent: 1,
        failed: 0,
        skipped: 1,
        opted_out: 1,
        pause_reason: null,
        occurred_at: '2026-11-22T03:00:06.000Z',
      },
    }
    expect(webhookPayloadSchema.safeParse(recipient).success).toBe(true)
    expect(webhookPayloadSchema.safeParse(status).success).toBe(true)
    expect(
      webhookPayloadSchema.safeParse({
        ...recipient,
        data: { ...recipient.data, status: 'delivered' },
      }).success,
    ).toBe(false)
    expect(
      webhookPayloadSchema.safeParse({
        ...status,
        data: { ...status.data, status: 'running' },
      }).success,
    ).toBe(false)
  })
})

describe('kontrak opt-out', () => {
  it('hanya menerima nomor digit dan sumber yang dikenal', () => {
    expect(createOptOutSchema.safeParse({ phone: '62812345678' }).success).toBe(true)
    expect(createOptOutSchema.safeParse({ phone: '+62812345678' }).success).toBe(false)
    expect(
      optOutSchema.safeParse({
        id: 'o1',
        phoneE164: '62812345678',
        source: 'manual',
        optedOutAt: '2026-11-16T10:00:00.000Z',
      }).success,
    ).toBe(true)
  })
})

describe('kontrak pagination', () => {
  it('memakai batas default dan maksimum', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 20 })
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })
})

describe('kontrak statistik', () => {
  it('menolak field hilang', () => {
    expect(statsSchema.safeParse({ connectedSessions: 1 }).success).toBe(false)
  })
})

describe('kontrak settings', () => {
  it('membatasi maxSales 1..100 dan membentuk respons', () => {
    expect(updateSettingsSchema.safeParse({ maxSales: 1 }).success).toBe(true)
    expect(updateSettingsSchema.safeParse({ maxSales: 100 }).success).toBe(true)
    expect(updateSettingsSchema.safeParse({ maxSales: 0 }).success).toBe(false)
    expect(updateSettingsSchema.safeParse({ maxSales: 101 }).success).toBe(false)
    expect(updateSettingsSchema.safeParse({ maxSales: 2.5 }).success).toBe(false)
    expect(updateSettingsSchema.safeParse({}).success).toBe(false)
    expect(
      settingsSchema.safeParse({
        maxSales: 10,
        salesCount: 3,
        defaultMinDelay: 10,
        defaultMaxDelay: 30,
      }).success,
    ).toBe(true)
    expect(settingsSchema.safeParse({ maxSales: 10 }).success).toBe(false)
  })

  it('memvalidasi rentang default delay', () => {
    expect(
      updateSettingsSchema.safeParse({ defaultMinDelay: 10, defaultMaxDelay: 30 }).success,
    ).toBe(true)
    expect(updateSettingsSchema.safeParse({ defaultMinDelay: 10 }).success).toBe(false)
    expect(
      updateSettingsSchema.safeParse({ defaultMinDelay: 60, defaultMaxDelay: 30 }).success,
    ).toBe(false)
    expect(
      updateSettingsSchema.safeParse({ defaultMinDelay: 9, defaultMaxDelay: 30 }).success,
    ).toBe(false)
    expect(
      updateSettingsSchema.safeParse({ defaultMinDelay: 10, defaultMaxDelay: 601 }).success,
    ).toBe(false)
  })
})
