import { describe, expect, it } from 'vitest'

import { ERROR_CODES, apiErrorBody } from './errors.js'

describe('kode error', () => {
  it('unik dan tidak kosong', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length)
    for (const code of ERROR_CODES) {
      expect(code).toMatch(/^[A-Z_]+$/)
    }
  })

  it('membentuk body error sesuai kontrak', () => {
    expect(apiErrorBody('NOT_FOUND', 'Sesi tidak ditemukan')).toEqual({
      error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan' },
    })
  })
})
