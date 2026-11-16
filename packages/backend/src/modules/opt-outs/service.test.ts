import { describe, expect, it, vi } from 'vitest'

import type { OptOutRow } from '../../db/schema.js'
import type { OptOutsRepository } from './repository.js'
import { createOptOutsService, isOptOutKeyword } from './service.js'

const OPT_OUT: OptOutRow = {
  id: 'o1',
  phoneE164: '628123456789',
  source: 'keyword',
  optedOutAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createService(row: OptOutRow | null) {
  const repo = {
    findByPhone: vi.fn(async () => row),
    insertIfAbsent: vi.fn(async () => undefined),
  } as unknown as OptOutsRepository
  return createOptOutsService(repo)
}

describe('opt-outs service', () => {
  it('menandai nomor yang sudah opt-out', async () => {
    await expect(createService(OPT_OUT).isOptedOut('628123456789')).resolves.toBe(true)
  })

  it('mengembalikan false untuk nomor yang belum opt-out', async () => {
    await expect(createService(null).isOptedOut('628123456789')).resolves.toBe(false)
  })

  it('mendeteksi kata kunci opt-out tanpa peduli huruf besar dan spasi', () => {
    expect(isOptOutKeyword(' stop ')).toBe(true)
    expect(isOptOutKeyword('Berhenti')).toBe(true)
    expect(isOptOutKeyword('unsubscribe')).toBe(true)
    expect(isOptOutKeyword('jangan stop')).toBe(false)
  })

  it('menyimpan opt-out idempoten hanya untuk pesan kata kunci', async () => {
    const repo = {
      insertIfAbsent: vi.fn(async () => undefined),
    } as unknown as OptOutsRepository
    const service = createOptOutsService(repo)

    await expect(service.recordKeyword('628123456789', 'STOP')).resolves.toBe(true)
    await expect(service.recordKeyword('628123456789', 'Halo')).resolves.toBe(false)
    await expect(service.recordKeyword(null, 'STOP')).resolves.toBe(false)
    expect(repo.insertIfAbsent).toHaveBeenCalledOnce()
  })
})
