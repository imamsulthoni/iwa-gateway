import { describe, expect, it, vi } from 'vitest'

import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import { ValidationError } from '../errors.js'
import type { OptOutsService } from '../opt-outs/service.js'
import type { WebhookOutbox } from '../webhooks/outbox.js'
import type { BroadcastsRepository } from './repository.js'
import { createBroadcastsService, prepareRecipients } from './service.js'

describe('prepareRecipients', () => {
  it('menormalkan nomor dan menyimpan nama', () => {
    expect(prepareRecipients([{ to: '08123456789', name: 'Budi' }])).toEqual([
      { toJid: '628123456789@s.whatsapp.net', name: 'Budi', ref: null },
    ])
  })

  it('menyimpan ref milik consumer', () => {
    expect(prepareRecipients([{ to: '08123456789', ref: 'crm-1' }])).toEqual([
      { toJid: '628123456789@s.whatsapp.net', name: null, ref: 'crm-1' },
    ])
  })

  it('menolak nomor duplikat setelah normalisasi', () => {
    expect(() => prepareRecipients([{ to: '08123456789' }, { to: '+628123456789' }])).toThrow(
      ValidationError,
    )
  })

  it('menolak ref duplikat', () => {
    expect(() =>
      prepareRecipients([
        { to: '08123456789', ref: 'crm-1' },
        { to: '08123456780', ref: 'crm-1' },
      ]),
    ).toThrow(ValidationError)
  })

  it('mengembalikan daftar kosong untuk input kosong', () => {
    expect(prepareRecipients([])).toEqual([])
  })
})

describe('current', () => {
  function build(status: BroadcastRow['status']) {
    const row = {
      id: 'b1',
      sessionId: 's1',
      text: 'Halo',
      status,
      clientRef: null,
      minDelayMs: 10_000,
      maxDelayMs: 20_000,
      scheduledAt: null,
      startedAt: null,
      finishedAt: null,
      pauseReason: null,
      createdAt: new Date(),
    }
    const repo = {
      findLatestBySession: async () => row,
      listRecipients: async () => [],
    } as unknown as BroadcastsRepository
    return createBroadcastsService(repo, {} as OptOutsService)
  }

  it('mengembalikan broadcast yang masih berjalan', async () => {
    await expect(build('running').current('s1')).resolves.toMatchObject({
      jobId: 'b1',
      status: 'running',
    })
  })

  it('berhenti menampilkan broadcast yang sudah final', async () => {
    for (const status of ['done', 'failed', 'cancelled'] as const) {
      await expect(build(status).current('s1')).resolves.toBeNull()
    }
  })
})

describe('event webhook broadcast', () => {
  const BROADCAST: BroadcastRow = {
    id: 'b1',
    sessionId: 's1',
    text: 'Halo',
    status: 'running',
    clientRef: 'bc-1',
    minDelayMs: 10_000,
    maxDelayMs: 20_000,
    scheduledAt: null,
    startedAt: null,
    finishedAt: null,
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const RECIPIENT: BroadcastRecipientRow = {
    id: 42,
    broadcastId: 'b1',
    toJid: '628123456789@s.whatsapp.net',
    name: 'Budi',
    ref: 'crm-8821',
    messageId: null,
    status: 'pending',
    error: null,
  }

  function build(record = vi.fn(async () => 1)) {
    const repo = {
      findById: vi.fn(async () => BROADCAST),
      listRecipients: vi.fn(async () => [
        { ...RECIPIENT, status: 'sent' as const },
        { ...RECIPIENT, id: 43, ref: 'crm-8822', status: 'skipped' as const, error: 'opted_out' },
      ]),
      updateRecipient: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
    } as unknown as BroadcastsRepository
    const service = createBroadcastsService(repo, {} as OptOutsService, {
      webhooks: { record } as unknown as WebhookOutbox,
      logger: { warn: vi.fn() },
    })
    return { service, repo, record }
  }

  it('memancarkan event penerima beserta message_id, ref, dan phone', async () => {
    const { service, repo, record } = build()

    await service.markRecipient(BROADCAST, RECIPIENT, 'sent', { messageId: 'm1' })

    expect(repo.updateRecipient).toHaveBeenCalledWith(42, {
      status: 'sent',
      error: null,
      messageId: 'm1',
    })
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast.recipient',
        session_id: 's1',
        data: expect.objectContaining({
          broadcast_id: 'b1',
          recipient_id: 42,
          to: '628123456789@s.whatsapp.net',
          phone: '628123456789',
          ref: 'crm-8821',
          status: 'sent',
          message_id: 'm1',
          error: null,
        }),
      }),
    )
  })

  it('hanya memancarkan broadcast.status untuk status terminal', async () => {
    const { service, record } = build()

    await service.setStatus('b1', 'running')
    expect(record).not.toHaveBeenCalled()

    await service.setStatus('b1', 'done')
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast.status',
        data: expect.objectContaining({
          broadcast_id: 'b1',
          status: 'done',
          total: 2,
          sent: 1,
          skipped: 1,
          opted_out: 1,
        }),
      }),
    )
  })

  it('tidak melempar saat penulisan outbox gagal', async () => {
    const { service } = build(vi.fn(async () => Promise.reject(new Error('db down'))))

    await expect(
      service.markRecipient(BROADCAST, RECIPIENT, 'failed', { error: 'gagal' }),
    ).resolves.toBeUndefined()
  })
})