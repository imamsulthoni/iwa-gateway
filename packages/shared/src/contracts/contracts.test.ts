import { describe, expect, it } from 'vitest'

import { createBroadcastSchema } from './broadcast.js'
import { retryMessageResponseSchema, sendMessageSchema } from './message.js'
import { createSessionSchema, publicIdSchema } from './session.js'
import { statsSchema } from './stats.js'

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
})

describe('kontrak pesan', () => {
  it('menolak pesan kosong', () => {
    expect(
      sendMessageSchema.safeParse({ to: '62812345678', referenceId: 'r1', text: '' }).success,
    ).toBe(false)
  })

  it('menerima pesan dengan field opsional', () => {
    const parsed = sendMessageSchema.parse({
      to: '62812345678',
      referenceId: 'r1',
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
      referenceId: 'ref-1',
      body: 'Halo',
      status: 'queued',
      waMessageId: null,
      error: null,
      customerName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    expect(retryMessageResponseSchema.safeParse({ message }).success).toBe(true)
    expect(retryMessageResponseSchema.safeParse({ message: { id: 'm1' } }).success).toBe(false)
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
        referenceId: 'b1',
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
        referenceId: 'b1',
      }).success,
    ).toBe(false)
  })
})

describe('kontrak statistik', () => {
  it('menolak field hilang', () => {
    expect(statsSchema.safeParse({ connectedSessions: 1 }).success).toBe(false)
  })
})
