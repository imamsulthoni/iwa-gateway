import { describe, expect, it } from 'vitest'

import { stepIndex } from './field'

describe('stepIndex', () => {
  it('mulai dari opsi pertama saat belum ada yang aktif', () => {
    expect(stepIndex(-1, 1, 3)).toBe(0)
  })

  it('berputar di kedua ujung', () => {
    expect(stepIndex(2, 1, 3)).toBe(0)
    expect(stepIndex(0, -1, 3)).toBe(2)
  })

  it('mengembalikan -1 untuk daftar kosong', () => {
    expect(stepIndex(0, 1, 0)).toBe(-1)
  })
})