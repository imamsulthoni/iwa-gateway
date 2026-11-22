import type { UserDto, UserRole } from '@wbc/shared'

export type AuthState =
  { mode: 'admin'; apiKey: string } | { mode: 'sales'; token: string; user: UserDto }

const STORAGE_KEY = 'wa_auth_v1'
const LEGACY_KEY = 'wa_api_key'

function readLegacy(): string | null {
  try {
    return sessionStorage.getItem(LEGACY_KEY)
  } catch {
    return null
  }
}

function isUser(value: unknown): value is UserDto {
  if (!value || typeof value !== 'object') return false
  const user = value as Record<string, unknown>
  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.phoneNumber === 'string' &&
    (user.role === 'admin' || user.role === 'sales') &&
    typeof user.active === 'boolean'
  )
}

function isAuthState(value: unknown): value is AuthState {
  if (!value || typeof value !== 'object') return false
  const state = value as Record<string, unknown>
  if (state.mode === 'admin') {
    return typeof state.apiKey === 'string' && state.apiKey.length > 0
  }
  return (
    state.mode === 'sales' &&
    typeof state.token === 'string' &&
    state.token.length > 0 &&
    isUser(state.user)
  )
}

export function getAuth(): AuthState | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }

  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return isAuthState(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  // Tab lama masih menyimpan API key mentah di key sebelumnya.
  const legacy = readLegacy()
  return legacy ? { mode: 'admin', apiKey: legacy } : null
}

function write(state: AuthState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    sessionStorage.removeItem(LEGACY_KEY)
  } catch {
    // sessionStorage tidak tersedia; login tidak bisa bertahan di tab ini.
  }
}

export function getApiKey(): string | null {
  const auth = getAuth()
  return auth?.mode === 'admin' ? auth.apiKey : null
}

export function getUserToken(): string | null {
  const auth = getAuth()
  return auth?.mode === 'sales' ? auth.token : null
}

export function getRole(): UserRole | null {
  const auth = getAuth()
  if (!auth) return null
  return auth.mode === 'admin' ? 'admin' : auth.user.role
}

export function isAdmin(): boolean {
  return getRole() === 'admin'
}

export function setApiKey(value: string): void {
  write({ mode: 'admin', apiKey: value })
}

export function setSalesAuth(token: string, user: UserDto): void {
  write({ mode: 'sales', token, user })
}

export function clearAuth(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem(LEGACY_KEY)
  } catch {
    // tidak ada yang bisa dibersihkan.
  }
}
