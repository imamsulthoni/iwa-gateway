import { describe, expect, it } from 'vitest'

import { ValidationError } from '../errors.js'
import { prepareRecipients } from './service.js'

describe('prepareRecipients', () => {
  it('menormalkan nomor dan menyimpan nama', () => {
    expect(prepareRecipients([{ to: '08123456789', name: 'Budi' }])).toEqual([
      { toJid: '628123456789@s.whatsapp.net', name: 'Budi' },
    ])
  })

  it('menolak nomor duplikat setelah normalisasi', () => {
    expect(() => prepareRecipients([{ to: '08123456789' }, { to: '+628123456789' }])).toThrow(
      ValidationError,
    )
  })

  it('mengembalikan daftar kosong untuk input kosong', () => {
    expect(prepareRecipients([])).toEqual([])
  })
})
