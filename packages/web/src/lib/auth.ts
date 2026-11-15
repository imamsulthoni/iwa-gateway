const STORAGE_KEY = 'wa_api_key'
const PREVIEW_KEY = 'wa_preview_mode'
const TOKEN_PREFIX = 'wa_session_token:'

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

export function setPreviewMode(): void {
  sessionStorage.setItem(PREVIEW_KEY, '1')
}

export function clearPreviewMode(): void {
  sessionStorage.removeItem(PREVIEW_KEY)
}

export function isPreviewMode(): boolean {
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

export function getSessionToken(sessionId: string): string | null {
  try {
    return sessionStorage.getItem(`${TOKEN_PREFIX}${sessionId}`)
  } catch {
    return null
  }
}

export function setSessionToken(sessionId: string, token: string): void {
  sessionStorage.setItem(`${TOKEN_PREFIX}${sessionId}`, token)
}
