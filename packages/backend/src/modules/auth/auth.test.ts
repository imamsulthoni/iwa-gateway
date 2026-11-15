import { describe, expect, it } from 'vitest'

import { hashApiKey, verifyApiKey } from './api-key.js'
import { generateSessionToken, hashSessionToken, verifySessionToken } from './session-token.js'

describe('API key', () => {
  it('menyimpan hash SHA-256 dan memverifikasi plaintext', () => {
    const key = 'wa_contoh'
    const hash = hashApiKey(key)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(key)
    expect(verifyApiKey(key, hash)).toBe(true)
    expect(verifyApiKey('wa_salah', hash)).toBe(false)
  })
})

describe('token sesi', () => {
  it('token acak, hash stabil, dan verifikasi ketat', () => {
    const first = generateSessionToken()
    const second = generateSessionToken()
    expect(first).not.toBe(second)
    expect(hashSessionToken(first)).toBe(hashSessionToken(first))
    expect(verifySessionToken(first, hashSessionToken(first))).toBe(true)
    expect(verifySessionToken(second, hashSessionToken(first))).toBe(false)
  })
})
