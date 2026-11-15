import { describe, expect, it } from 'vitest'

import { formatDateTime, formatNumber, phoneFromJid, truncate } from './format.js'

describe('util format', () => {
  it('memformat angka gaya Indonesia', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
  })

  it('menampilkan tanggal atau tanda hubung', () => {
    expect(formatDateTime(null)).toBe('-')
    expect(formatDateTime('bukan-tanggal')).toBe('-')
    expect(formatDateTime('2026-11-15T06:00:00.000Z')).not.toBe('-')
  })

  it('memotong teks panjang', () => {
    expect(truncate('pendek', 10)).toBe('pendek')
    expect(truncate('1234567890', 5)).toBe('1234…')
  })

  it('mengambil nomor dari JID', () => {
    expect(phoneFromJid(null)).toBe('-')
    expect(phoneFromJid('628123456789:5@s.whatsapp.net')).toBe('628123456789')
  })
})
