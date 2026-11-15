import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, api, verifyApiKey } from './api.js'
import { getApiKey, setApiKey } from './auth.js'

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

    await expect(api.get('/sessions')).resolves.toEqual({ items: [] })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(headers.get('x-api-key')).toBe('wa_key')
  })

  it('401 menghapus API key dan melempar ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Nope' } }), {
            status: 401,
          }),
      ),
    )

    await expect(api.get('/sessions')).rejects.toBeInstanceOf(ApiError)
    expect(getApiKey()).toBeNull()
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

    await expect(api.post('/sessions', {})).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'Data tidak valid',
    })
  })

  it('verifyApiKey mengirim key tanpa menyimpannya', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(verifyApiKey('kandidat')).resolves.toBe(true)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Headers(init.headers).get('x-api-key')).toBe('kandidat')
  })
})
