import { describe, expect, it } from 'vitest'

import { createBroadcastSchema } from './broadcast.js'
import { sendMessageSchema } from './message.js'
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
