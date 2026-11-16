import { describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'
import type { QueueRegistry } from '../infra/queue.js'
import { createLogger } from '../infra/logger.js'
import type { RedisClient } from '../infra/redis.js'
import { hashSessionToken } from '../modules/auth/session-token.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { SessionsService } from '../modules/sessions/service.js'
import { createApp, type AppDependencies } from './app.js'

const TOKEN = 'token-sesi'
const SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc047b'

const SESSION: WaSessionRow = {
  id: SESSION_ID,
  publicId: 'smoke',
  label: 'Smoke',
  phoneNumber: null,
  status: 'connected',
  lastQr: null,
  lastConnectedAt: null,
  tokenHash: hashSessionToken(TOKEN),
  tokenRotatedAt: null,
  salesId: null,
  agentId: null,
  dailySendLimit: 200,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createTestApp(overrides: Partial<AppDependencies> = {}) {
  const redis = {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    publish: vi.fn(async () => 1),
  } as unknown as RedisClient

  const db = {
    execute: vi.fn(async () => []),
  } as unknown as AppDependencies['db']

  const sessions = {
    get: vi.fn(async (id: string) => {
      if (id !== SESSION_ID) throw new Error('tidak dipakai')
      return SESSION
    }),
    list: vi.fn(async () => [SESSION]),
    updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
      ...SESSION,
      status,
      ...patch,
    })),
  } as unknown as SessionsService

  const messages = {
    createOutgoing: vi.fn(async () => ({
      message: {
        id: 'message-1',
        sessionId: SESSION_ID,
        to: '628123456789@s.whatsapp.net',
        referenceId: 'ref-1',
        body: 'Halo',
        status: 'queued' as const,
        waMessageId: null,
        error: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
      duplicate: false,
    })),
  } as unknown as MessagesService

  const queue = { add: vi.fn(async () => undefined) }
  const queues = {
    send: queue,
    broadcast: queue,
  } as unknown as QueueRegistry

  const deps: AppDependencies = {
    env: {
      NODE_ENV: 'test',
      PORT: 3000,
      DATABASE_URL: 'mysql://x',
      REDIS_URL: 'redis://x',
      AUTH_ENC_KEY: Buffer.alloc(32).toString('base64'),
      LOG_LEVEL: 'silent',
      APP_TIMEZONE: 'Asia/Jakarta',
      CORS_ORIGIN: 'http://localhost:5173',
      BROWSER_NAME: 'test',
      SESSION_LOCK_TTL_MS: 30000,
      RATE_LIMIT_PER_MIN: 60,
    },
    logger: createLogger('silent'),
    redis,
    db,
    auth: {
      findActive: async (plaintext) => (plaintext === 'valid-key' ? { id: 'key-1' } : null),
    },
    sessions,
    messages,
    broadcasts: {
      current: async () => null,
      create: async () => {
        throw new Error('tidak dipakai')
      },
    } as unknown as AppDependencies['broadcasts'],
    stats: {
      get: async () => ({
        connectedSessions: 0,
        todayMessages: 0,
        totalMessages: 0,
        runningBroadcasts: 0,
      }),
    } as unknown as AppDependencies['stats'],
    queues,
    ...overrides,
  }

  return { app: createApp(deps), queue, messages, redis, sessions }
}

describe('API Hono', () => {
  it('GET / publik mengembalikan nama, versi, dan status', async () => {
    const { app } = createTestApp()
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: 'wa-bot-service',
      version: '0.1.0',
      status: 'ok',
      checks: { database: true, redis: true },
    })
  })

  it('GET /stats menolak tanpa API key dan menerima key valid', async () => {
    const { app } = createTestApp()
    const unauthorized = await app.request('/stats')
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key wajib dikirim' },
    })

    const invalid = await app.request('/stats', { headers: { 'x-api-key': 'salah' } })
    expect(invalid.status).toBe(401)

    const ok = await app.request('/stats', { headers: { 'x-api-key': 'valid-key' } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      connectedSessions: 0,
      todayMessages: 0,
      totalMessages: 0,
      runningBroadcasts: 0,
    })
  })

  it('endpoint tidak dikenal memakai format error yang sama', async () => {
    const { app } = createTestApp()
    const response = await app.request('/tidak-ada')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' },
    })
  })

  it('error tak terduga menjadi 500 tanpa stack trace', async () => {
    const { app } = createTestApp({
      stats: {
        get: async () => {
          throw new Error('rahasia internal')
        },
      } as unknown as AppDependencies['stats'],
    })
    const response = await app.request('/stats', { headers: { 'x-api-key': 'valid-key' } })
    expect(response.status).toBe(500)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(JSON.stringify(body)).not.toContain('rahasia internal')
  })

  it('kirim pesan memakai Bearer token sesi dan meng-enqueue job', async () => {
    const { app, queue, messages } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '628123456789', referenceId: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(202)
    expect(messages.createOutgoing).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('token sesi salah ditolak', async () => {
    const { app, queue } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token-salah',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '628123456789', referenceId: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('login memulai sesi lewat kanal kontrol worker', async () => {
    const { app, redis } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/login`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(redis.publish).toHaveBeenCalledWith(
      'wa:session:control',
      JSON.stringify({ sessionId: SESSION_ID, action: 'start' }),
    )
  })

  it('cancel pairing menghentikan sesi dan mengosongkan QR', async () => {
    const pairingSession = { ...SESSION, status: 'qr_pending' as const, lastQr: 'data:image/png' }
    const { app, redis } = createTestApp({
      sessions: {
        get: vi.fn(async () => pairingSession),
        list: vi.fn(async () => [pairingSession]),
        updateStatus: vi.fn(
          async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
            ...pairingSession,
            status,
            ...patch,
          }),
        ),
      } as unknown as SessionsService,
    })

    const response = await app.request(`/sessions/${SESSION_ID}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'disconnected' })
    expect(redis.publish).toHaveBeenCalledWith(
      'wa:session:control',
      JSON.stringify({ sessionId: SESSION_ID, action: 'stop', clearAuth: true }),
    )
  })

  it('cancel ditolak saat sesi sudah terhubung', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/cancel`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(409)
  })

  it('rate limit per API key mengembalikan 429 dan Retry-After', async () => {
    const counts = new Map<string, number>()
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1
        counts.set(key, next)
        return next
      }),
      expire: vi.fn(async () => 1),
    } as unknown as RedisClient

    const { app } = createTestApp({
      redis,
      auth: {
        findActive: async (plaintext) =>
          plaintext === 'key-a' || plaintext === 'key-b' ? { id: plaintext } : null,
      },
    })

    for (let i = 0; i < 60; i += 1) {
      const response = await app.request('/stats', { headers: { 'x-api-key': 'key-a' } })
      expect(response.status).toBe(200)
    }

    const limited = await app.request('/stats', { headers: { 'x-api-key': 'key-a' } })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')

    const other = await app.request('/stats', { headers: { 'x-api-key': 'key-b' } })
    expect(other.status).toBe(200)
  })
})
