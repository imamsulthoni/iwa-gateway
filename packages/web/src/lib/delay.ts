import { DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS, isValidDelayRange } from '@wa/shared'

const STORAGE_KEY = 'wa_default_delay'

export type DelaySettings = {
  min: number
  max: number
}

export function getDefaultDelay(): DelaySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { min: DEFAULT_MIN_DELAY_SECONDS, max: DEFAULT_MAX_DELAY_SECONDS }
    const parsed = JSON.parse(raw) as Partial<DelaySettings>
    if (
      typeof parsed.min === 'number' &&
      typeof parsed.max === 'number' &&
      isValidDelayRange(parsed.min, parsed.max)
    ) {
      return { min: parsed.min, max: parsed.max }
    }
  } catch {
    // localStorage tidak tersedia atau nilainya rusak
  }
  return { min: DEFAULT_MIN_DELAY_SECONDS, max: DEFAULT_MAX_DELAY_SECONDS }
}

export function saveDefaultDelay(settings: DelaySettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
