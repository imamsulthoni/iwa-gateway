import { describe, expect, it } from 'vitest'

import type { BroadcastsRepository } from '../broadcasts/repository.js'
import type { MessagesRepository } from '../messages/repository.js'
import type { SessionsRepository } from '../sessions/repository.js'
import { createStatsService, startOfDayUtc } from './service.js'

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

describe('stats service', () => {
  it('menggabungkan hitungan sesi, pesan, dan broadcast', async () => {
    const sessions = {
      countByStatus: async (status: string) => (status === 'connected' ? 2 : 0),
    } as unknown as SessionsRepository
    const messages = {
      countTotal: async () => 120,
      countTodayAll: async () => 7,
    } as unknown as MessagesRepository
    const broadcasts = {
      countByStatus: async (status: string) => (status === 'running' ? 3 : 0),
    } as unknown as BroadcastsRepository

    const service = createStatsService({
      sessions,
      messages,
      broadcasts,
      timezone: 'Asia/Jakarta',
    })

    await expect(service.get()).resolves.toEqual({
      connectedSessions: 2,
      todayMessages: 7,
      totalMessages: 120,
      runningBroadcasts: 3,
    })
  })
})
