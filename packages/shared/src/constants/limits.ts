export const MIN_DELAY_SECONDS = 10
export const MAX_DELAY_SECONDS = 600
export const DEFAULT_MIN_DELAY_SECONDS = 10
export const DEFAULT_MAX_DELAY_SECONDS = 30

export const HISTORY_PAGE_SIZE_DEFAULT = 20
export const HISTORY_PAGE_SIZE_MAX = 100
export const CROSS_SESSION_PAGE_SIZE_DEFAULT = 50
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

export const DAILY_SEND_LIMIT_DEFAULT = 200

export const BROADCAST_AUTO_PAUSE_MIN_RECIPIENTS = 20

export function isValidDelayRange(minSeconds: number, maxSeconds: number): boolean {
  return (
    Number.isInteger(minSeconds) &&
    Number.isInteger(maxSeconds) &&
    minSeconds >= MIN_DELAY_SECONDS &&
    maxSeconds <= MAX_DELAY_SECONDS &&
    maxSeconds >= minSeconds
  )
}

export function pickDelayMs(minSeconds: number, maxSeconds: number, random = Math.random): number {
  const lower = Math.max(MIN_DELAY_SECONDS, Math.min(minSeconds, maxSeconds))
  const upper = Math.min(MAX_DELAY_SECONDS, Math.max(minSeconds, maxSeconds))
  return Math.round((lower + random() * (upper - lower)) * 1000)
}
