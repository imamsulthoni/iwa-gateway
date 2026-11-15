import { describe, expect, it } from 'vitest'

import { MAX_DELAY_SECONDS, MIN_DELAY_SECONDS, isValidDelayRange, pickDelayMs } from './limits.js'

describe('isValidDelayRange', () => {
  it('menerima batas minimum dan maksimum', () => {
    expect(isValidDelayRange(MIN_DELAY_SECONDS, MIN_DELAY_SECONDS)).toBe(true)
    expect(isValidDelayRange(MIN_DELAY_SECONDS, MAX_DELAY_SECONDS)).toBe(true)
  })

  it('menolak nilai di bawah 10 dan di atas 600', () => {
    expect(isValidDelayRange(9, 30)).toBe(false)
    expect(isValidDelayRange(10, 601)).toBe(false)
  })

  it('menolak max lebih kecil dari min', () => {
    expect(isValidDelayRange(60, 30)).toBe(false)
  })

  it('menolak nilai bukan integer', () => {
    expect(isValidDelayRange(10.5, 30)).toBe(false)
  })
})

describe('pickDelayMs', () => {
  it('mengembalikan nilai dalam rentang milidetik', () => {
    expect(pickDelayMs(10, 20, () => 0)).toBe(10_000)
    expect(pickDelayMs(10, 20, () => 1)).toBe(20_000)
    expect(pickDelayMs(10, 20, () => 0.5)).toBe(15_000)
  })
})
