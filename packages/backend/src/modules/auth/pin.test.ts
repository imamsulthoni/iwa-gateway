import { describe, expect, it } from 'vitest'

import { hashPin, verifyPin } from './pin.js'

describe('PIN', () => {
  it('menghasilkan hash berbeda tiap panggilan dan tidak memuat PIN', () => {
    const first = hashPin('123456')
    const second = hashPin('123456')

    expect(first).toMatch(/^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/)
    expect(first).not.toBe(second)
    expect(first).not.toContain('123456')
  })

  it('menerima PIN benar dan menolak PIN salah', () => {
    const stored = hashPin('123456')

    expect(verifyPin('123456', stored)).toBe(true)
    expect(verifyPin('654321', stored)).toBe(false)
  })

  it('mengembalikan false untuk hash rusak tanpa throw', () => {
    const broken = [
      '',
      'plain',
      'bcrypt$salt$hash',
      'scrypt$hanya-salt',
      'scrypt$c2FsdA$dG9vLXNob3J0',
      'scrypt$$',
    ]

    for (const stored of broken) {
      expect(() => verifyPin('123456', stored)).not.toThrow()
      expect(verifyPin('123456', stored)).toBe(false)
    }
  })
})
