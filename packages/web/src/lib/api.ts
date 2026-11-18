import type { ApiErrorBody, AuthMeDto, LoginResponseDto } from '@wa/shared'

import { clearAuth, getAuth } from './auth'
import { getEnv } from './env'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Login sendiri memang bisa 401; jangan hapus form atau redirect saat PIN salah.
const SKIP_401_HANDLING = new Set(['/auth/login'])

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  const auth = getAuth()
  if (auth?.mode === 'admin') {
    headers.set('x-api-key', auth.apiKey)
  } else if (auth?.mode === 'sales') {
    headers.set('authorization', `Bearer ${auth.token}`)
  }

  const response = await fetch(`${getEnv().apiBaseUrl}${path}`, { ...init, headers })

  if (response.status === 401 && !SKIP_401_HANDLING.has(path) && !path.startsWith('/stats')) {
    clearAuth()
    if (typeof window !== 'undefined') window.location.assign('/app/login')
    throw new ApiError(401, 'UNAUTHORIZED', 'Sesi berakhir, silakan login ulang')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = (await response.json().catch(() => null)) as unknown
  if (!response.ok) {
    const error = body as ApiErrorBody | null
    throw new ApiError(
      response.status,
      error?.error.code ?? 'INTERNAL_ERROR',
      error?.error.message ?? 'Permintaan gagal',
    )
  }
  return body as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  const response = await fetch(`${getEnv().apiBaseUrl}/stats`, {
    headers: { 'x-api-key': apiKey },
  })
  return response.ok
}

export function login(phoneNumber: string, pin: string): Promise<LoginResponseDto> {
  return request<LoginResponseDto>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, pin }),
  })
}

export function fetchMe(): Promise<AuthMeDto> {
  return request<AuthMeDto>('/auth/me')
}

export async function logoutUser(): Promise<void> {
  try {
    await request<void>('/auth/logout', { method: 'POST' })
  } finally {
    clearAuth()
  }
}
