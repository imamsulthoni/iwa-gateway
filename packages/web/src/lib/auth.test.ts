import { beforeEach, describe, expect, it } from 'vitest'

import { clearApiKey, getApiKey, getSessionToken, setApiKey, setSessionToken } from './auth.js'

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

describe('penyimpanan auth web', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  })

  it('menyimpan dan menghapus API key per tab', () => {
    expect(getApiKey()).toBeNull()
    setApiKey('wa_key')
    expect(getApiKey()).toBe('wa_key')
    clearApiKey()
    expect(getApiKey()).toBeNull()
  })

  it('menyimpan token per sesi tanpa saling menimpa', () => {
    setSessionToken('s1', 'token-1')
    setSessionToken('s2', 'token-2')
    expect(getSessionToken('s1')).toBe('token-1')
    expect(getSessionToken('s2')).toBe('token-2')
    expect(getSessionToken('s3')).toBeNull()
  })
})
