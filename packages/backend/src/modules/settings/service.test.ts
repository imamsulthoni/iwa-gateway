import { DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS } from '@wbc/shared'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_DELAY_KEY,
  DEFAULT_MAX_SALES,
  DEFAULT_MIN_DELAY_KEY,
  MAX_SALES_KEY,
  type SettingsRepository,
} from './repository.js'
import { createSettingsService } from './service.js'

function createMemoryRepository(
  seed: {
    maxSales?: string
    minDelay?: string
    maxDelay?: string
    salesCount?: number
  } = {},
): SettingsRepository {
  const values = new Map<string, string>()
  if (seed.maxSales !== undefined) values.set(MAX_SALES_KEY, seed.maxSales)
  if (seed.minDelay !== undefined) values.set(DEFAULT_MIN_DELAY_KEY, seed.minDelay)
  if (seed.maxDelay !== undefined) values.set(DEFAULT_MAX_DELAY_KEY, seed.maxDelay)
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

const DEFAULT_DELAY = {
  defaultMinDelay: DEFAULT_MIN_DELAY_SECONDS,
  defaultMaxDelay: DEFAULT_MAX_DELAY_SECONDS,
}

describe('settings service', () => {
  it('memakai fallback 10 tanpa baris settings', async () => {
    const service = createSettingsService(createMemoryRepository({ salesCount: 3 }))
    expect(await service.getSettings()).toEqual({
      maxSales: DEFAULT_MAX_SALES,
      salesCount: 3,
      ...DEFAULT_DELAY,
    })
  })

  it('memakai fallback saat nilai tersimpan tidak valid', async () => {
    const service = createSettingsService(
      createMemoryRepository({ maxSales: 'nol', minDelay: '60', maxDelay: '30' }),
    )
    const settings = await service.getSettings()
    expect(settings.maxSales).toBe(DEFAULT_MAX_SALES)
    expect(settings.defaultMinDelay).toBe(DEFAULT_MIN_DELAY_SECONDS)
    expect(settings.defaultMaxDelay).toBe(DEFAULT_MAX_DELAY_SECONDS)
  })

  it('membaca delay tersimpan', async () => {
    const service = createSettingsService(
      createMemoryRepository({ minDelay: '15', maxDelay: '45' }),
    )
    expect(await service.getSettings()).toMatchObject({ defaultMinDelay: 15, defaultMaxDelay: 45 })
  })

  it('update idempoten dan mengembalikan state terbaru', async () => {
    const repo = createMemoryRepository()
    const service = createSettingsService(repo)

    expect(await service.updateSettings({ maxSales: 20 })).toMatchObject({ maxSales: 20 })
    expect(await service.updateSettings({ maxSales: 20 })).toMatchObject({ maxSales: 20 })
    expect(await repo.get(MAX_SALES_KEY)).toBe('20')

    expect(
      await service.updateSettings({ defaultMinDelay: 15, defaultMaxDelay: 45 }),
    ).toMatchObject({ defaultMinDelay: 15, defaultMaxDelay: 45 })
    expect(await repo.get(DEFAULT_MIN_DELAY_KEY)).toBe('15')
    expect(await repo.get(DEFAULT_MAX_DELAY_KEY)).toBe('45')
  })
})
