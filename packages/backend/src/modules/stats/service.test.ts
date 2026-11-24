import { describe, expect, it } from 'vitest'

import type { BroadcastsRepository } from '../broadcasts/repository.js'
import type { MessagesRepository } from '../messages/repository.js'
import type { SessionsRepository } from '../sessions/repository.js'
import {
  buildStatsBuckets,
  createStatsService,
  formatDayLocal,
  startOfDayUtc,
  startOfPeriodUtc,
} from './service.js'

describe('startOfDayUtc', () => {
  it('menghitung tengah malam zona layanan dalam UTC', () => {
    const now = new Date('2026-11-15T06:00:00.000Z') // 13:00 WIB
    expect(startOfDayUtc(now, 'Asia/Jakarta').toISOString()).toBe('2026-11-14T17:00:00.000Z')
  })

  it('pergantian hari mengikuti zona layanan', () => {
    const before = new Date('2026-11-14T16:59:59.000Z') // 23:59:59 WIB
    const after = new Date('2026-11-14T17:00:01.000Z') // 00:00:01 WIB
    expect(startOfDayUtc(before, 'Asia/Jakarta').toISOString()).toBe('2026-11-13T17:00:00.000Z')
    expect(startOfDayUtc(after, 'Asia/Jakarta').toISOString()).toBe('2026-11-14T17:00:00.000Z')
  })

  it('menghormati zona UTC', () => {
    const now = new Date('2026-11-15T06:00:00.000Z')
    expect(startOfDayUtc(now, 'UTC').toISOString()).toBe('2026-11-15T00:00:00.000Z')
  })
})

describe('startOfPeriodUtc', () => {
  const now = new Date('2026-11-18T06:00:00.000Z') // Rabu, 13:00 WIB

  it('mulai minggu di Senin zona layanan', () => {
    expect(startOfPeriodUtc(now, 'Asia/Jakarta', 'week').toISOString()).toBe(
      '2026-11-15T17:00:00.000Z',
    )
  })

  it('mulai bulan di tanggal 1 zona layanan', () => {
    expect(startOfPeriodUtc(now, 'Asia/Jakarta', 'month').toISOString()).toBe(
      '2026-10-31T17:00:00.000Z',
    )
  })

  it('mulai tahun di 1 Januari zona layanan', () => {
    expect(startOfPeriodUtc(now, 'Asia/Jakarta', 'year').toISOString()).toBe(
      '2025-12-31T17:00:00.000Z',
    )
  })
})

describe('formatDayLocal', () => {
  it('memakai zona layanan, bukan UTC', () => {
    const now = new Date('2026-11-24T06:00:00.000Z') // Selasa 13:00 WIB
    expect(formatDayLocal(now, 'Asia/Jakarta')).toBe('2026-11-24')
    expect(formatDayLocal(new Date('2026-11-24T18:00:00.000Z'), 'Asia/Jakarta')).toBe(
      '2026-11-25',
    )
  })
})

describe('buildStatsBuckets', () => {
  const now = new Date('2026-11-24T06:00:00.000Z') // Selasa 13:00 WIB

  it('day & week memakai minggu kalender yang sama', () => {
    const expected = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']
    for (const period of ['day', 'week'] as const) {
      const ranges = buildStatsBuckets(period, now, 'Asia/Jakarta')
      expect(ranges.map((range) => range.startDate)).toEqual(expected)
      expect(ranges[0]?.endDate).toBe('2026-11-23')
      expect(ranges[6]?.endDate).toBe('2026-11-29')
    }
  })

  it('month dipecah jadi bucket seimbang', () => {
    const ranges = buildStatsBuckets('month', now, 'Asia/Jakarta')
    expect(ranges.map((range) => [range.startDate, range.endDate])).toEqual([
      ['2026-11-01', '2026-11-06'],
      ['2026-11-07', '2026-11-12'],
      ['2026-11-13', '2026-11-18'],
      ['2026-11-19', '2026-11-24'],
      ['2026-11-25', '2026-11-30'],
    ])
  })

  it('year punya 12 bucket bulanan', () => {
    const ranges = buildStatsBuckets('year', now, 'Asia/Jakarta')
    expect(ranges).toHaveLength(12)
    expect([ranges[0]?.startDate, ranges[0]?.endDate]).toEqual(['2026-01-01', '2026-01-31'])
    expect([ranges[11]?.startDate, ranges[11]?.endDate]).toEqual(['2026-12-01', '2026-12-31'])
  })

  it('Februari 28 hari jadi 4 bucket, 29 hari jadi 5', () => {
    const short = buildStatsBuckets('month', new Date('2026-02-10T06:00:00.000Z'), 'Asia/Jakarta')
    expect(short.map((range) => range.endDate.slice(8, 10))).toEqual(['07', '14', '21', '28'])
    const leap = buildStatsBuckets('month', new Date('2028-02-10T06:00:00.000Z'), 'Asia/Jakarta')
    expect(leap).toHaveLength(5)
    expect(leap[4]?.endDate).toBe('2028-02-29')
  })
})

describe('stats service', () => {
  const now = new Date('2026-11-24T06:00:00.000Z') // Selasa 13:00 WIB

  function service(bucketValues?: (index: number) => number) {
    const sessions = {
      countByStatus: async (status: string) => (status === 'connected' ? 2 : 0),
    } as unknown as SessionsRepository
    // Default: hanya bucket hari ini (indeks 1 = Selasa) berisi data, sama seperti
    // kenyataan untuk `day`, sehingga jumlah semua bucket = periodMessages.
    const valueAt = bucketValues ?? ((index: number) => (index === 1 ? 7 : 0))
    const messages = {
      countTotal: async () => 120,
      countBetween: async (start: Date, end: Date, statuses: string[]) =>
        statuses.includes('failed') ? 4 : start.getTime() === end.getTime() ? 0 : 7,
      countInBuckets: async (ranges: unknown[], statuses: string[]) =>
        ranges.map((_, index) => (statuses.includes('failed') ? 0 : valueAt(index))),
    } as unknown as MessagesRepository
    const broadcasts = {
      countActive: async () => 3,
    } as unknown as BroadcastsRepository

    return createStatsService({ sessions, messages, broadcasts, timezone: 'Asia/Jakarta' })
  }

  it('menggabungkan hitungan sesi, pesan, broadcast, dan bucket', async () => {
    const dto = await service().get('day', now)
    expect(dto).toMatchObject({
      connectedSessions: 2,
      periodMessages: 7,
      periodFailed: 4,
      totalMessages: 120,
      runningBroadcasts: 3,
      todayDate: '2026-11-24',
      bucketKind: 'day',
    })
    expect(dto.buckets).toHaveLength(7)
    expect(dto.buckets[1]?.startDate).toBe(dto.todayDate)
  })

  it('hanya bar hari ini yang sama dengan periodMessages untuk day', async () => {
    // Ada pesan di hari lain minggu ini: jumlah 7 bar justru lebih besar dari
    // angka besar, dan service tidak boleh "memaksa" keduanya sama.
    const dto = await service((index) => (index === 1 ? 7 : 3)).get('day', now)
    const total = dto.buckets.reduce((sum, bucket) => sum + bucket.sent, 0)
    expect(total).toBeGreaterThan(dto.periodMessages)
    expect(dto.buckets[1]?.sent).toBe(dto.periodMessages)
  })

  it('jumlah bar sama dengan periodMessages untuk week, month, year', async () => {
    for (const period of ['week', 'month', 'year'] as const) {
      const dto = await service().get(period, now)
      const total = dto.buckets.reduce((sum, bucket) => sum + bucket.sent, 0)
      expect(total).toBe(dto.periodMessages)
    }
  })

  it('memakai jumlah bucket sesuai periode', async () => {
    for (const [period, length] of [
      ['day', 7],
      ['week', 7],
      ['month', 5],
      ['year', 12],
    ] as const) {
      const dto = await service().get(period, now)
      expect(dto.buckets).toHaveLength(length)
    }
  })

  it('membandingkan dengan periode penuh sebelumnya', async () => {
    const starts: number[] = []
    const messages = {
      countTotal: async () => 0,
      countBetween: async (start: Date) => {
        starts.push(start.getTime())
        return 0
      },
      countInBuckets: async (ranges: unknown[]) => ranges.map(() => 0),
    } as unknown as MessagesRepository
    const svc = createStatsService({
      sessions: { countByStatus: async () => 0 } as unknown as SessionsRepository,
      messages,
      broadcasts: { countActive: async () => 0 } as unknown as BroadcastsRepository,
      timezone: 'Asia/Jakarta',
    })

    await svc.get('week', now)
    // previousSince = Senin minggu sebelumnya.
    expect(new Date(starts[1] ?? 0).toISOString()).toBe('2026-11-15T17:00:00.000Z')

    starts.length = 0
    await svc.get('month', now)
    // previousSince = 1 Oktober.
    expect(new Date(starts[1] ?? 0).toISOString()).toBe('2026-09-30T17:00:00.000Z')
  })
})
