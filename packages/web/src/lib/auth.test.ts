import { beforeEach, describe, expect, it } from 'vitest'

import { clearApiKey, getApiKey, setApiKey } from './auth.js'

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
})
