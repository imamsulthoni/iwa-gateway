import { clearApiKey, getApiKey } from './auth'
import { getEnv } from './env'
import type { ApiErrorBody } from '@wa/shared'

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

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (token) {
    headers.set('authorization', `Bearer ${token}`)
  } else {
    const apiKey = getApiKey()
    if (apiKey) headers.set('x-api-key', apiKey)
  }

  const response = await fetch(`${getEnv().apiBaseUrl}${path}`, { ...init, headers })

  if (response.status === 401 && !path.startsWith('/stats')) {
    clearApiKey()
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
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export async function verifyApiKey(apiKey: string): Promise<boolean> {
  const response = await fetch(`${getEnv().apiBaseUrl}/stats`, {
    headers: { 'x-api-key': apiKey },
  })
  return response.ok
}
