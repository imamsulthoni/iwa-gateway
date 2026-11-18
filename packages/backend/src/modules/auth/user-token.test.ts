import { describe, expect, it } from 'vitest'

import { generateUserToken, hashUserToken, verifyUserToken } from './user-token.js'

describe('token user', () => {
  it('menghasilkan token acak 32 byte yang tidak disimpan mentah', () => {
    const token = generateUserToken()
    const hash = hashUserToken(token)

    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
  })

  it('verifikasi hanya lolos untuk token yang cocok', () => {
    const token = generateUserToken()
    const other = generateUserToken()
    const hash = hashUserToken(token)

    expect(verifyUserToken(token, hash)).toBe(true)
    expect(verifyUserToken(other, hash)).toBe(false)
    expect(verifyUserToken(token, 'bukan-hash')).toBe(false)
  })
})
