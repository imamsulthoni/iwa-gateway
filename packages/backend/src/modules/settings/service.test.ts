import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_SALES,
  MAX_SALES_KEY,
  type SettingsRepository,
} from './repository.js'
import { createSettingsService } from './service.js'

function createMemoryRepository(
  seed: { maxSales?: string; salesCount?: number } = {},
): SettingsRepository {
  const values = new Map<string, string>()
  if (seed.maxSales !== undefined) values.set(MAX_SALES_KEY, seed.maxSales)
  const salesCount = seed.salesCount ?? 0

  return {
    async get(key) {
      return values.get(key) ?? null
    },
    async upsert(key, value) {
      values.set(key, value)
    },
    async countSales() {
      return salesCount
    },
  }
}

describe('settings service', () => {
  it('memakai fallback 10 tanpa baris settings', async () => {
    const service = createSettingsService(createMemoryRepository({ salesCount: 3 }))
    expect(await service.getSettings()).toEqual({ maxSales: DEFAULT_MAX_SALES, salesCount: 3 })
  })

  it('memakai fallback saat nilai tersimpan tidak valid', async () => {
    const service = createSettingsService(createMemoryRepository({ maxSales: 'nol' }))
    expect((await service.getSettings()).maxSales).toBe(DEFAULT_MAX_SALES)
  })

  it('update idempoten dan mengembalikan state terbaru', async () => {
    const repo = createMemoryRepository()
    const service = createSettingsService(repo)

    expect(await service.updateSettings({ maxSales: 20 })).toMatchObject({ maxSales: 20 })
    expect(await service.updateSettings({ maxSales: 20 })).toMatchObject({ maxSales: 20 })
    expect(await repo.get(MAX_SALES_KEY)).toBe('20')
  })
})