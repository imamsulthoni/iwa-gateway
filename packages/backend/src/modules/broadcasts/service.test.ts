import { describe, expect, it } from 'vitest'

import type { BroadcastRow } from '../../db/schema.js'
import { ValidationError } from '../errors.js'
import type { OptOutsService } from '../opt-outs/service.js'
import type { BroadcastsRepository } from './repository.js'
import { createBroadcastsService, prepareRecipients } from './service.js'

describe('prepareRecipients', () => {
  it('menormalkan nomor dan menyimpan nama', () => {
    expect(prepareRecipients([{ to: '08123456789', name: 'Budi' }])).toEqual([
      { toJid: '628123456789@s.whatsapp.net', name: 'Budi' },
    ])
  })

  it('menolak nomor duplikat setelah normalisasi', () => {
    expect(() => prepareRecipients([{ to: '08123456789' }, { to: '+628123456789' }])).toThrow(
      ValidationError,
    )
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