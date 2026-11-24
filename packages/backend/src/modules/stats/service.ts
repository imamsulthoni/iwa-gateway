import { STATS_BUCKET_KIND } from '@wbc/shared'
import type { MessageStatus, StatsBucketDto, StatsDto, StatsPeriod } from '@wbc/shared'

import type { BroadcastsRepository } from '../broadcasts/repository.js'
import type { MessagesRepository } from '../messages/repository.js'
import type { SessionsRepository } from '../sessions/repository.js'

export type StatsServiceDeps = {
  sessions: SessionsRepository
  messages: MessagesRepository
  broadcasts: BroadcastsRepository
  timezone: string
}

export type StatsService = ReturnType<typeof createStatsService>

const SENT: MessageStatus[] = ['sent', 'delivered', 'read']
const FAILED: MessageStatus[] = ['failed']

type LocalDate = { year: number; month: number; day: number }

type StatsRange = {
  start: Date
  end: Date
  startDate: string
  endDate: string
}

function localParts(date: Date, timezone: string): LocalDate & { offsetMs: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const year = Number(parts.year)
  const month = Number(parts.month) - 1
  const day = Number(parts.day)
  const asUtc = Date.UTC(
    year,
    month,
    day,
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  // Abaikan milidetik: masukan seperti `since - 1` tidak boleh menggeser offset.
  const offsetMs = asUtc - Math.floor(date.getTime() / 1000) * 1000
  return { year, month, day, offsetMs }
}

export function startOfPeriodUtc(now: Date, timezone: string, period: StatsPeriod): Date {
  const { year, month, day, offsetMs } = localParts(now, timezone)

  let startDay = 1
  if (period === 'day') startDay = day
  // Minggu mulai Senin.
  if (period === 'week') startDay = day - ((new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7)

  return new Date(Date.UTC(year, period === 'year' ? 0 : month, startDay) - offsetMs)
}

export function startOfDayUtc(now: Date, timezone: string): Date {
  return startOfPeriodUtc(now, timezone, 'day')
}

export function formatDayLocal(date: Date, timezone: string): string {
  const { year, month, day } = localParts(date, timezone)
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

function weekdayMondayFirst(year: number, month: number, day: number): number {
  return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7
}

/**
 * Lokal `{ y, m, d }` → instant, memakai offset tunggal yang diturunkan dari `now`
 * (pola sama seperti `startOfPeriodUtc`). Aman untuk zona tanpa DST seperti
 * `Asia/Jakarta`; akan meleset 1 jam di zona ber-DST.
 */
function toRange(
  year: number,
  month: number,
  startDay: number,
  endDayExclusive: number,
  offsetMs: number,
): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month, startDay) - offsetMs),
    end: new Date(Date.UTC(year, month, endDayExclusive) - offsetMs),
  }
}

function withDates(
  year: number,
  month: number,
  startDay: number,
  endDayExclusive: number,
  offsetMs: number,
): StatsRange {
  const { start, end } = toRange(year, month, startDay, endDayExclusive, offsetMs)
  const dayString = (instant: Date): string =>
    new Date(instant.getTime() + offsetMs).toISOString().slice(0, 10)
  return {
    start,
    end,
    // `end` eksklusif, `endDate` inklusif.
    startDate: dayString(start),
    endDate: dayString(new Date(end.getTime() - 1)),
  }
}

export function weekBuckets(
  { year, month, day }: LocalDate,
  offsetMs: number,
): StatsRange[] {
  const monday = day - weekdayMondayFirst(year, month, day)
  return Array.from({ length: 7 }, (_, index) =>
    withDates(year, month, monday + index, monday + index + 1, offsetMs),
  )
}

export function monthWeekBuckets(
  { year, month }: LocalDate,
  offsetMs: number,
): StatsRange[] {
  const total = daysInMonth(year, month)
  const count = Math.ceil(total / 7)
  const base = Math.floor(total / count)
  const extra = total % count

  const ranges: StatsRange[] = []
  let startDay = 1
  for (let index = 0; index < count; index += 1) {
    const length = base + (index < extra ? 1 : 0)
    ranges.push(withDates(year, month, startDay, startDay + length, offsetMs))
    startDay += length
  }
  return ranges
}

export function yearMonthBuckets({ year }: LocalDate, offsetMs: number): StatsRange[] {
  return Array.from({ length: 12 }, (_, month) =>
    withDates(year, month, 1, daysInMonth(year, month) + 1, offsetMs),
  )
}

export function buildStatsBuckets(
  period: StatsPeriod,
  now: Date,
  timezone: string,
): StatsRange[] {
  const parts = localParts(now, timezone)
  if (period === 'day' || period === 'week') return weekBuckets(parts, parts.offsetMs)
  if (period === 'month') return monthWeekBuckets(parts, parts.offsetMs)
  return yearMonthBuckets(parts, parts.offsetMs)
}

export function createStatsService({ sessions, messages, broadcasts, timezone }: StatsServiceDeps) {
  return {
    async get(period: StatsPeriod = 'day', now = new Date()): Promise<StatsDto> {
      const ranges = buildStatsBuckets(period, now, timezone)
      const since = startOfPeriodUtc(now, timezone, period)
      // Periode penuh tepat sebelum periode berjalan: kemarin / minggu lalu / bulan lalu.
      const previousSince = startOfPeriodUtc(new Date(since.getTime() - 1), timezone, period)

      const [
        connectedSessions,
        totalMessages,
        runningBroadcasts,
        periodMessages,
        previousPeriodMessages,
        periodFailed,
        bucketsSent,
        bucketsFailed,
      ] = await Promise.all([
        sessions.countByStatus('connected'),
        messages.countTotal(),
        broadcasts.countActive(),
        messages.countBetween(since, now, SENT),
        messages.countBetween(previousSince, since, SENT),
        messages.countBetween(since, now, FAILED),
        messages.countInBuckets(ranges, SENT),
        messages.countInBuckets(ranges, FAILED),
      ])

      const buckets: StatsBucketDto[] = ranges.map((range, index) => ({
        startDate: range.startDate,
        endDate: range.endDate,
        sent: bucketsSent[index] ?? 0,
        failed: bucketsFailed[index] ?? 0,
      }))

      return {
        connectedSessions,
        periodMessages,
        previousPeriodMessages,
        periodFailed,
        totalMessages,
        runningBroadcasts,
        todayDate: formatDayLocal(now, timezone),
        bucketKind: STATS_BUCKET_KIND[period],
        buckets,
      }
    },
  }
}
