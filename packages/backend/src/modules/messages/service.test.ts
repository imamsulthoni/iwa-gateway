import { describe, expect, it, vi } from 'vitest'

import type { MessageRow } from '../../db/schema.js'
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import type { MessagesRepository } from './repository.js'
import { createMessagesService } from './service.js'

function row(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'm1',
    conversationId: null,
    sessionId: 's1',
    waMessageId: null,
    clientRef: 'ref-1',
    direction: 'out',
    type: 'text',
    body: 'Halo',
    raw: null,
    status: 'failed',
    error: 'Nomor tidak terdaftar di WhatsApp',
    toJid: '628123456789@s.whatsapp.net',
    customerId: null,
    customerName: null,
    broadcastId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    waTimestamp: null,
    deletedAt: null,
    ...overrides,
  }
}

function createService(initial: MessageRow | null) {
  const requeueFailed = vi.fn(async () => true)
  const repo = {
    findById: vi.fn(async () => initial),
    requeueFailed,
  } as unknown as MessagesRepository
  return { service: createMessagesService(repo), requeueFailed }
}

describe('kirim ulang pesan gagal', () => {
  it('mengembalikan status queued untuk pesan failed', async () => {
    const { service, requeueFailed } = createService(row())

    const message = await service.retry('m1')

    expect(requeueFailed).toHaveBeenCalledWith('m1')
    expect(message.status).toBe('queued')
    expect(message.error).toBeNull()
  })

  it('menolak pesan yang belum gagal', async () => {
    const { service, requeueFailed } = createService(row({ status: 'sent' }))

    await expect(service.retry('m1')).rejects.toBeInstanceOf(ValidationError)
    expect(requeueFailed).not.toHaveBeenCalled()
  })

  it('menolak pesan yang sudah dihapus', async () => {
    const { service, requeueFailed } = createService(row({ deletedAt: new Date() }))

    await expect(service.retry('m1')).rejects.toBeInstanceOf(ValidationError)
    expect(requeueFailed).not.toHaveBeenCalled()
  })

  it('menolak pesan yang tidak ditemukan', async () => {
    const { service } = createService(null)

    await expect(service.retry('m1')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('konflik saat status berubah di antara baca dan tulis', async () => {
    const { service, requeueFailed } = createService(row())
    requeueFailed.mockResolvedValueOnce(false)

    await expect(service.retry('m1')).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('filter arah riwayat', () => {
  it('meneruskan direction ke repository', async () => {
    const listAll = vi.fn(async () => ({ items: [], nextCursor: null }))
    const listBySession = vi.fn(async () => ({ items: [], nextCursor: null }))
    const service = createMessagesService({
      listAll,
      listBySession,
    } as unknown as MessagesRepository)

    await service.listAll(10, 's1', undefined, 'out')
    expect(listAll).toHaveBeenCalledWith(10, 's1', undefined, 'out')

    await service.listBySession('s1', 10, undefined, 'in')
    expect(listBySession).toHaveBeenCalledWith('s1', 10, undefined, 'in')
  })
})

describe('status pesan', () => {
  it('mengembalikan JID tujuan untuk payload webhook', async () => {
    const repo = {
      findByWaMessageId: vi.fn(async () => row({ status: 'sent' })),
      updateStatus: vi.fn(async () => undefined),
      addStatusEvent: vi.fn(async () => undefined),
    } as unknown as MessagesRepository
    const service = createMessagesService(repo)

    await expect(service.applyStatusUpdate('s1', 'wa-1', 3)).resolves.toEqual({
      id: 'm1',
      clientRef: 'ref-1',
      toJid: '628123456789@s.whatsapp.net',
      status: 'delivered',
    })
  })
})
