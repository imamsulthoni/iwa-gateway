import { DEFAULT_MAX_SALES, MAX_SALES_KEY, type SettingsRepository } from './repository.js'

export type Settings = {
  maxSales: number
  salesCount: number
}

export type SettingsService = ReturnType<typeof createSettingsService>

function parseMaxSales(raw: string | null): number {
  if (raw === null) return DEFAULT_MAX_SALES
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : DEFAULT_MAX_SALES
}

export function createSettingsService(repo: SettingsRepository) {
  async function getSettings(): Promise<Settings> {
    const [raw, salesCount] = await Promise.all([repo.get(MAX_SALES_KEY), repo.countSales()])
    return { maxSales: parseMaxSales(raw), salesCount }
  }

  return {
    getSettings,

    async updateSettings(values: { maxSales: number }): Promise<Settings> {
      await repo.upsert(MAX_SALES_KEY, String(values.maxSales))
      return getSettings()
    },
  }
}