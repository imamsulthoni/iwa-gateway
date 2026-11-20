import type { UserDto } from '@wa/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, login, verifyApiKey } from './api.js'
import { clearAuth, getApiKey, getAuth, setApiKey, setSalesAuth } from './auth.js'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const SALES: UserDto = {
  id: 'user-1',
  name: 'Rani',
  phoneNumber: '628123456789',
  role: 'sales',
  active: true,
}

describe('klien API web', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
    setApiKey('wa_key')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mengirim header x-api-key dan mem-parse JSON', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/v1/sessions')).resolves.toEqual({ items: [] })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('x-api-key')).toBe('wa_key')
    expect(headers.get('authorization')).toBeNull()
  })

  it('mengirim Bearer token untuk sales', async () => {
    setSalesAuth('tok_123', SALES)
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await api.get('/v1/sessions')
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('authorization')).toBe('Bearer tok_123')
    expect(headers.get('x-api-key')).toBeNull()
  })

  it('401 menghapus auth dan melempar ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Nope' } }), {
            status: 401,
          }),
      ),
    )

    await expect(api.get('/v1/sessions')).rejects.toBeInstanceOf(ApiError)
    expect(getApiKey()).toBeNull()
  })

  it('401 sales tidak menyisakan token', async () => {
    setSalesAuth('tok_123', SALES)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    )

    await expect(api.get('/v1/sessions')).rejects.toMatchObject({ status: 401 })
    expect(getAuth()).toBeNull()
  })

  it('403 tidak memaksa logout', async () => {
    setSalesAuth('tok_123', SALES)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Tolak' } }), {
            status: 403,
          }),
      ),
    )

    await expect(api.get('/v1/settings')).rejects.toMatchObject({ status: 403 })
    expect(getAuth()).toEqual({ mode: 'sales', token: 'tok_123', user: SALES })
  })

  it('error API memakai code dan message dari body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }),
            { status: 422 },
          ),
      ),
    )

    await expect(api.post('/v1/sessions', {})).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Data tidak valid',
    })
  })

  it('login mengirim nomor dan PIN tanpa memakai auth lama', async () => {
    clearAuth()
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ token: 'tok', expiresAt: '2026-01-01T00:00:00.000Z', user: SALES }),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(login('628123456789', '1234')).resolves.toMatchObject({ token: 'tok' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/v1/auth/login')
    expect(init.body).toBe(JSON.stringify({ phoneNumber: '628123456789', pin: '1234' }))
    expect(new Headers(init.headers).get('authorization')).toBeNull()
  })

  it('401 dari login tidak menghapus auth atau melempar sesi berakhir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Nomor atau PIN salah' } }),
            { status: 401 },
          ),
      ),
    )

    await expect(login('628123456789', '9999')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Nomor atau PIN salah',
    })
  })

  it('verifyApiKey mengirim key tanpa menyimpannya', async () => {
    clearAuth()
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyApiKey('kandidat')).resolves.toBe(true)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('x-api-key')).toBe('kandidat')
    expect(getAuth()).toBeNull()
  })
})
