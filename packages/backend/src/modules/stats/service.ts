import type { StatsDto, StatsPeriod } from '@wbc/shared'

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

export function startOfPeriodUtc(now: Date, timezone: string, period: StatsPeriod): Date {
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
      .formatToParts(now)
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
  const offsetMs = asUtc - now.getTime()

  let startDay = 1
  if (period === 'day') startDay = day
  // Minggu mulai Senin.
  if (period === 'week') startDay = day - ((new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7)

  return new Date(Date.UTC(year, period === 'year' ? 0 : month, startDay) - offsetMs)
}

export function startOfDayUtc(now: Date, timezone: string): Date {
  return startOfPeriodUtc(now, timezone, 'day')
}

export function createStatsService({ sessions, messages, broadcasts, timezone }: StatsServiceDeps) {
  return {
    async get(period: StatsPeriod = 'day', now = new Date()): Promise<StatsDto> {
      const since = startOfPeriodUtc(now, timezone, period)
      const [connectedSessions, totalMessages, runningBroadcasts, periodMessages] =
        await Promise.all([
          sessions.countByStatus('connected'),
          messages.countTotal(),
          broadcasts.countActive(),
          messages.countSince(since),
        ])
      return { connectedSessions, periodMessages, totalMessages, runningBroadcasts }
    },
  }
}
