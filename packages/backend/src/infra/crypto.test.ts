import { describe, expect, it } from 'vitest'

import { createCipher } from './crypto.js'

const KEY = Buffer.alloc(32, 1).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 2).toString('base64')

describe('crypto auth state', () => {
  it('round-trip plaintext', () => {
    const cipher = createCipher(KEY)
    const plaintext = JSON.stringify({ creds: { noiseKey: 'abc' }, value: 'rahasia' })
    expect(cipher.decrypt(cipher.encrypt(plaintext))).toBe(plaintext)
  })

  it('kunci salah gagal dekripsi', () => {
    const cipher = createCipher(KEY)
    const payload = cipher.encrypt('rahasia')
    expect(() => createCipher(OTHER_KEY).decrypt(payload)).toThrow()
  })

  it('plaintext sama menghasilkan ciphertext berbeda', () => {
    const cipher = createCipher(KEY)
    expect(cipher.encrypt('sama')).not.toBe(cipher.encrypt('sama'))
  })

  it('menolak kunci bukan 32 byte', () => {
    expect(() => createCipher(Buffer.alloc(16).toString('base64'))).toThrow()
  })

  it('menolak payload rusak', () => {
    expect(() => createCipher(KEY).decrypt('bukan-payload')).toThrow()
  })
})
