import type { UserDto } from '@wa/shared'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearAuth,
  getApiKey,
  getAuth,
  getRole,
  getUserToken,
  isAdmin,
  setApiKey,
  setSalesAuth,
} from './auth.js'

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

describe('penyimpanan auth web', () => {
  let local: MemoryStorage

  beforeEach(() => {
    local = new MemoryStorage()
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
    Object.defineProperty(globalThis, 'localStorage', { value: local, configurable: true })
  })

  it('menyimpan mode admin sebagai API key', () => {
    setApiKey('wa_key')
    expect(getAuth()).toEqual({ mode: 'admin', apiKey: 'wa_key' })
    expect(getApiKey()).toBe('wa_key')
    expect(getUserToken()).toBeNull()
    expect(getRole()).toBe('admin')
    expect(isAdmin()).toBe(true)
  })

  it('menyimpan mode sales sebagai token + user', () => {
    setSalesAuth('tok_123', SALES)
    expect(getAuth()).toEqual({ mode: 'sales', token: 'tok_123', user: SALES })
    expect(getApiKey()).toBeNull()
    expect(getUserToken()).toBe('tok_123')
    expect(getRole()).toBe('sales')
    expect(isAdmin()).toBe(false)
  })

  it('membersihkan auth saat logout', () => {
    setSalesAuth('tok_123', SALES)
    clearAuth()
    expect(getAuth()).toBeNull()
    expect(getRole()).toBeNull()
  })

  it('menganggap data rusak sebagai belum login', () => {
    sessionStorage.setItem('wa_auth_v1', '{bukan json')
    expect(getAuth()).toBeNull()
    sessionStorage.setItem('wa_auth_v1', JSON.stringify({ mode: 'sales', token: '' }))
    expect(getAuth()).toBeNull()
  })

  it('membaca API key lama dan memindahkannya ke key berversi', () => {
    sessionStorage.setItem('wa_api_key', 'legacy_key')
    expect(getApiKey()).toBe('legacy_key')

    setApiKey('legacy_key')
    expect(getApiKey()).toBe('legacy_key')
    expect(sessionStorage.getItem('wa_api_key')).toBeNull()
  })

  it('tidak menulis auth ke localStorage', () => {
    setSalesAuth('tok_123', SALES)
    expect(local.getItem('wa_auth_v1')).toBeNull()
    expect(local.getItem('wa_api_key')).toBeNull()
  })
})
