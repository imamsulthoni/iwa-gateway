const STORAGE_KEY = 'wa_api_key'

export function getApiKey(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setApiKey(value: string): void {
  sessionStorage.setItem(STORAGE_KEY, value)
}

export function clearApiKey(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}
