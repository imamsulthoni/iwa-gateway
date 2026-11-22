import type { StatsDto } from '@wbc/shared'

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

export function startOfDayUtc(now: Date, timezone: string): Date {
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
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const offsetMs = asUtc - now.getTime()
  const localMidnightAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
  )
  return new Date(localMidnightAsUtc - offsetMs)
}

export function createStatsService({ sessions, messages, broadcasts, timezone }: StatsServiceDeps) {
  return {
    async get(now = new Date()): Promise<StatsDto> {
      const since = startOfDayUtc(now, timezone)
      const [connectedSessions, totalMessages, runningBroadcasts, todayMessages] =
        await Promise.all([
          sessions.countByStatus('connected'),
          messages.countTotal(),
          broadcasts.countActive(),
          messages.countTodayAll(since),
        ])
      return { connectedSessions, todayMessages, totalMessages, runningBroadcasts }
    },
  }
}
