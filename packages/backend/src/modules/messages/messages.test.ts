import { describe, expect, it } from 'vitest'

import type { MessageRow } from '../../db/schema.js'
import { normalizePhone, phoneFromJid, toUserJid } from './phone.js'
import { toMessageDto } from './service.js'
import { mapBaileysStatus, shouldAdvanceStatus } from './status.js'

const MESSAGE: MessageRow = {
  id: 'm1',
  conversationId: null,
  sessionId: 's1',
  waMessageId: null,
  clientRef: null,
  direction: 'out',
  type: 'text',
  body: 'Halo',
  raw: null,
  status: 'sent',
  error: null,
  toJid: '628123456789@s.whatsapp.net',
  customerId: null,
  customerName: null,
  broadcastId: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  waTimestamp: null,
  deletedAt: null,
}

describe('normalisasi nomor', () => {
  it('menyamakan 08xx, +62xx, dan 62xx', () => {
    expect(normalizePhone('08123456789')).toBe('628123456789')
    expect(normalizePhone('+62 812-3456-789')).toBe('628123456789')
    expect(normalizePhone('628123456789')).toBe('628123456789')
  })

  it('membentuk JID user', () => {
    expect(toUserJid('08123456789')).toBe('628123456789@s.whatsapp.net')
    expect(toUserJid('628123456789@s.whatsapp.net')).toBe('628123456789@s.whatsapp.net')
  })

  it('mengambil nomor dari JID', () => {
    expect(phoneFromJid('628123456789:12@s.whatsapp.net')).toBe('628123456789')
  })

  it('menolak nomor terlalu pendek', () => {
    expect(() => normalizePhone('123')).toThrow()
  })
})

describe('mapping pesan', () => {
  it('mengisi salesName dari join owner sesi', () => {
    expect(toMessageDto({ ...MESSAGE, salesName: 'Sales A' }).salesName).toBe('Sales A')
  })

  it('fallback null untuk pesan sesi lama', () => {
    expect(toMessageDto(MESSAGE).salesName).toBeNull()
  })
})

describe('mapping status Baileys', () => {
  it('memetakan status numerik', () => {
    expect(mapBaileysStatus(0)).toBe('failed')
    expect(mapBaileysStatus(1)).toBe('queued')
    expect(mapBaileysStatus(2)).toBe('sent')
    expect(mapBaileysStatus(3)).toBe('delivered')
    expect(mapBaileysStatus(4)).toBe('read')
    expect(mapBaileysStatus(5)).toBe('read')
  })

  it('memetakan status string', () => {
    expect(mapBaileysStatus('ERROR')).toBe('failed')
    expect(mapBaileysStatus('SERVER_ACK')).toBe('sent')
    expect(mapBaileysStatus('DELIVERY_ACK')).toBe('delivered')
    expect(mapBaileysStatus('READ')).toBe('read')
    expect(mapBaileysStatus('tidak-dikenal')).toBeNull()
  })

  it('status tidak mundur', () => {
    expect(shouldAdvanceStatus('queued', 'sent')).toBe(true)
    expect(shouldAdvanceStatus('delivered', 'sent')).toBe(false)
    expect(shouldAdvanceStatus('read', 'failed')).toBe(false)
    expect(shouldAdvanceStatus('failed', 'sent')).toBe(false)
    expect(shouldAdvanceStatus('sent', 'sent')).toBe(false)
  })
})
