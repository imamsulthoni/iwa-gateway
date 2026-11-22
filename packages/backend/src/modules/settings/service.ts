import { DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS, isValidDelayRange } from '@wbc/shared'

import {
  DEFAULT_MAX_DELAY_KEY,
  DEFAULT_MAX_SALES,
  DEFAULT_MIN_DELAY_KEY,
  MAX_SALES_KEY,
  type SettingsRepository,
} from './repository.js'

export type Settings = {
  maxSales: number
  salesCount: number
  defaultMinDelay: number
  defaultMaxDelay: number
}

export type SettingsService = ReturnType<typeof createSettingsService>

function parseMaxSales(raw: string | null): number {
  if (raw === null) return DEFAULT_MAX_SALES
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : DEFAULT_MAX_SALES
}

function parseDelay(minRaw: string | null, maxRaw: string | null): { min: number; max: number } {
  const min = Number(minRaw)
  const max = Number(maxRaw)
  if (Number.isInteger(min) && Number.isInteger(max) && isValidDelayRange(min, max)) {
    return { min, max }
  }
  return { min: DEFAULT_MIN_DELAY_SECONDS, max: DEFAULT_MAX_DELAY_SECONDS }
}

export function createSettingsService(repo: SettingsRepository) {
  async function getSettings(): Promise<Settings> {
    const [maxSalesRaw, minDelayRaw, maxDelayRaw, salesCount] = await Promise.all([
      repo.get(MAX_SALES_KEY),
      repo.get(DEFAULT_MIN_DELAY_KEY),
      repo.get(DEFAULT_MAX_DELAY_KEY),
      repo.countSales(),
    ])
    const delay = parseDelay(minDelayRaw, maxDelayRaw)
    return {
      maxSales: parseMaxSales(maxSalesRaw),
      salesCount,
      defaultMinDelay: delay.min,
      defaultMaxDelay: delay.max,
    }
  }

  return {
    getSettings,

    async updateSettings(values: {
      maxSales?: number
      defaultMinDelay?: number
      defaultMaxDelay?: number
    }): Promise<Settings> {
      const writes: Promise<void>[] = []
      if (values.maxSales !== undefined) {
        writes.push(repo.upsert(MAX_SALES_KEY, String(values.maxSales)))
      }
      if (values.defaultMinDelay !== undefined) {
        writes.push(repo.upsert(DEFAULT_MIN_DELAY_KEY, String(values.defaultMinDelay)))
      }
      if (values.defaultMaxDelay !== undefined) {
        writes.push(repo.upsert(DEFAULT_MAX_DELAY_KEY, String(values.defaultMaxDelay)))
      }
      await Promise.all(writes)
      return getSettings()
    },
  }
}
