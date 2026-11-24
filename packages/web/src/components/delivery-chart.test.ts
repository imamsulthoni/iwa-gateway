import { describe, expect, it } from 'vitest'

import type { StatsBucketDto } from '@wbc/shared'

import { barHeights, bucketLabel, bucketState, bucketTooltip } from './delivery-chart'

function bucket(startDate: string, endDate: string, sent = 0, failed = 0): StatsBucketDto {
  return { startDate, endDate, sent, failed }
}

describe('barHeights', () => {
  it('proporsional terhadap nilai maksimum', () => {
    expect(barHeights([0, 10, 20])).toEqual([12, 23, 46])
  })

  it('semua nol tetap terlihat', () => {
    expect(barHeights([0, 0, 0])).toEqual([12, 12, 12])
  })

  it('satu nilai langsung maksimum', () => {
    expect(barHeights([5])).toEqual([46])
  })

  it('nilai negatif dibulatkan ke minimum', () => {
    expect(barHeights([-3, 10])).toEqual([12, 46])
  })
})

describe('bucketLabel', () => {
  const range = (startDate: string, endDate: string) => bucket(startDate, endDate)

  it('hari Senin-first', () => {
    expect(bucketLabel(range('2026-11-23', '2026-11-23'), 'day', 0)).toBe('S')
    expect(bucketLabel(range('2026-11-29', '2026-11-29'), 'day', 6)).toBe('M')
    expect(bucketLabel(range('2026-11-24', '2026-11-24'), 'day', 1)).toBe('S')
  })

  it('blok minggu memakai nomor urut', () => {
    expect(bucketLabel(range('2026-11-01', '2026-11-06'), 'week', 0)).toBe('1')
    expect(bucketLabel(range('2026-11-25', '2026-11-30'), 'week', 4)).toBe('5')
  })

  it('bulan memakai singkatan id-ID', () => {
    expect(bucketLabel(range('2026-01-01', '2026-01-31'), 'month', 0)).toBe('Jan')
    expect(bucketLabel(range('2026-12-01', '2026-12-31'), 'month', 11)).toBe('Des')
  })
})

describe('bucketState', () => {
  it('memetakan past, current, future', () => {
    expect(bucketState(bucket('2026-11-19', '2026-11-24'), '2026-11-24')).toBe('current')
    expect(bucketState(bucket('2026-11-19', '2026-11-24'), '2026-11-25')).toBe('past')
    expect(bucketState(bucket('2026-11-25', '2026-11-30'), '2026-11-24')).toBe('future')
  })

  it('todayDate tepat di batas tetap current', () => {
    expect(bucketState(bucket('2026-11-19', '2026-11-24'), '2026-11-19')).toBe('current')
  })
})

describe('bucketTooltip', () => {
  it('rentang penuh dengan gagal', () => {
    expect(bucketTooltip(bucket('2026-11-19', '2026-11-24', 128, 2), 'week')).toBe(
      '19 Nov–24 Nov · 128 pesan · 2 gagal',
    )
  })

  it('bucket satu hari tidak diulang', () => {
    expect(bucketTooltip(bucket('2026-11-24', '2026-11-24', 24), 'day')).toBe('Sel 24 Nov · 24 pesan')
  })

  it('bucket kosong', () => {
    expect(bucketTooltip(bucket('2026-11-01', '2026-11-06'), 'week')).toBe('1 Nov–6 Nov · 0 pesan')
  })
})
