import { CONSUMER_ENDPOINTS } from '@wbc/shared'
import { describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'
import type { QueueRegistry } from '../infra/queue.js'
import { createLogger } from '../infra/logger.js'
import type { RedisClient } from '../infra/redis.js'
import { hashSessionToken } from '../modules/auth/session-token.js'
import type { AuthService } from '../modules/auth/service.js'
import { NoSessionError, UnauthorizedError, ValidationError } from '../modules/errors.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { SettingsService } from '../modules/settings/service.js'
import { createApp, type AppDependencies } from './app.js'
import { openApiDocumentConfig } from './openapi.js'

const TOKEN = 'token-sesi'
const USER_TOKEN = 'token-user'
const SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc047b'

const AUTH_USER = {
  id: 'user-1',
  name: 'Sales A',
  phoneNumber: '628123456789',
  role: 'sales' as const,
  active: true,
}

const SESSION: WaSessionRow = {
  id: SESSION_ID,
  publicId: 'smoke',
  label: 'Smoke',
  engine: 'baileys',
  phoneNumber: null,
  status: 'connected',
  lastQr: null,
  lastConnectedAt: null,
  tokenHash: hashSessionToken(TOKEN),
  tokenRotatedAt: null,
  salesId: null,
  agentId: null,
  ownerUserId: AUTH_USER.id,
  dailySendLimit: 200,
  authFormat: 'v7',
  pairingMethod: 'qr',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const TEST_ENV: AppDependencies['env'] = {
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
  BROADCAST_AUTO_PAUSE_RATIO: 0.2,
  WEBHOOK_ALLOW_HTTP_PRIVATE: false,
}

function createTestApp(overrides: Partial<AppDependencies> = {}) {
  const redis = {
    incr: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    ping: vi.fn(async () => 'PONG'),
    publish: vi.fn(async () => 1),
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    hmget: vi.fn(async () => []),
  } as unknown as RedisClient

  const db = {
    execute: vi.fn(async () => []),
  } as unknown as AppDependencies['db']

  const sessions = {
    get: vi.fn(async (id: string) => {
      if (id !== SESSION_ID) throw new Error('tidak dipakai')
      return SESSION
    }),
    getByPublicId: vi.fn(async (publicId: string) => {
      if (publicId !== SESSION.publicId) throw new Error('tidak dipakai')
      return SESSION
    }),
    list: vi.fn(async () => [SESSION]),
    create: vi.fn(async () => ({ session: SESSION, token: TOKEN })),
    remove: vi.fn(async () => undefined),
    rotateToken: vi.fn(async () => ({ session: SESSION, token: TOKEN })),
    setPhoneNumber: vi.fn(async () => SESSION),
    resetSalesPin: vi.fn(async () => SESSION),
    attachSales: vi.fn(async () => SESSION),
    updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
      ...SESSION,
      status,
      ...patch,
    })),
  } as unknown as SessionsService

  const messages = {
    listAll: vi.fn(async () => ({ items: [], nextCursor: null })),
    listBySession: vi.fn(async () => ({ items: [], nextCursor: null })),
    remove: vi.fn(async () => undefined),
    findByClientRef: vi.fn(async () => null),
    createOutgoing: vi.fn(async () => ({
      message: {
        id: 'message-1',
        sessionId: SESSION_ID,
        to: '628123456789@s.whatsapp.net',
        clientRef: 'ref-1',
        body: 'Halo',
        status: 'queued' as const,
        waMessageId: null,
        error: null,
        customerName: null,
        salesName: null,
        createdAt: new Date().toISOString(),
        deletedAt: null,
      },
      duplicate: false,
    })),
    retry: vi.fn(async () => ({
      id: 'message-1',
      sessionId: SESSION_ID,
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'queued' as const,
      waMessageId: null,
      error: null,
      customerName: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    })),
  } as unknown as MessagesService

  const queue = { add: vi.fn(async () => undefined) }
  const queues = {
    send: queue,
    broadcast: queue,
  } as unknown as QueueRegistry

  const conversations = {
    get: vi.fn(async (id: string) => ({
      id,
      sessionId: SESSION_ID,
      waJid: '628123456789@s.whatsapp.net',
      waJidAlt: null,
      lastMessageAt: null,
      unreadCount: 0,
    })),
    findBySessionAndAddress: vi.fn(async () => null),
    listRooms: vi.fn(async () => ({ items: [], nextCursor: null })),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    markRead: vi.fn(async () => ({})),
  } as unknown as AppDependencies['conversations']

  const userAuth = {
    login: vi.fn(async (phoneNumber: string, pin: string) => {
      if (phoneNumber !== AUTH_USER.phoneNumber || pin !== '123456') {
        throw new UnauthorizedError('Nomor atau PIN salah')
      }
      return {
        token: USER_TOKEN,
        expiresAt: new Date('2026-12-01T00:00:00.000Z'),
        user: AUTH_USER,
      }
    }),
    authenticate: vi.fn(async (token: string) => (token === USER_TOKEN ? AUTH_USER : null)),
    logout: vi.fn(async () => undefined),
    me: vi.fn(async () => AUTH_USER),
  } as unknown as AuthService

  const settings = {
    getSettings: vi.fn(async () => ({
      maxSales: 10,
      salesCount: 2,
      defaultMinDelay: 10,
      defaultMaxDelay: 30,
    })),
    updateSettings: vi.fn(
      async (values: {
        maxSales?: number
        defaultMinDelay?: number
        defaultMaxDelay?: number
      }) => ({
        maxSales: values.maxSales ?? 10,
        salesCount: 2,
        defaultMinDelay: values.defaultMinDelay ?? 10,
        defaultMaxDelay: values.defaultMaxDelay ?? 30,
      }),
    ),
  } as unknown as SettingsService

  const deps: AppDependencies = {
    env: TEST_ENV,
    logger: createLogger('silent'),
    redis,
    db,
    auth: {
      findActive: async (plaintext) => (plaintext === 'valid-key' ? { id: 'key-1' } : null),
    },
    userAuth,
    sessions,
    messages,
    conversations,
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
    settings,
    webhooks: {} as unknown as AppDependencies['webhooks'],
    queues,
    ...overrides,
  }

  return {
    app: createApp(deps),
    queue,
    messages,
    conversations,
    redis,
    sessions,
    userAuth,
    settings,
  }
}

function attemptLogin(app: ReturnType<typeof createApp>, phoneNumber: string, ip: string) {
  return app.request(
    '/auth/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber, pin: '654321' }),
    },
    { incoming: { socket: { remoteAddress: ip } } } as never,
  )
}

describe('API Hono', () => {
  it('GET / publik mengembalikan nama, versi, status, dan metrik', async () => {
    const { app } = createTestApp()
    const response = await app.request('/')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      name: 'WA Bot Console',
      version: '0.1.0',
      status: 'ok',
      checks: { database: true, redis: true },
      metrics: {
        inbound: { processed: 0, duplicates: 0, nonText: 0 },
        sse: { activeConnections: 0 },
        webhooks: { delivered: 0, failed: 0, retry: 0, pendingDue: 0, outboxLagMs: 0 },
        optOuts: 0,
        broadcastsPaused: 0,
      },
    })
  })

  it('GET / degraded saat outbox webhook tertinggal', async () => {
    const db = {
      execute: vi.fn(async () => [
        [{ optOuts: 2, broadcastsPaused: 1, pendingDue: 3, outboxLagMs: 60_000 }],
        [],
      ]),
    } as unknown as AppDependencies['db']
    const { app } = createTestApp({ db })
    const response = await app.request('/')

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      status: string
      metrics: { webhooks: Record<string, number>; optOuts: number; broadcastsPaused: number }
    }
    expect(body.status).toBe('degraded')
    expect(body.metrics.webhooks).toMatchObject({ pendingDue: 3, outboxLagMs: 60_000 })
    expect(body.metrics.optOuts).toBe(2)
    expect(body.metrics.broadcastsPaused).toBe(1)
  })

  it('GET /stats menolak tanpa API key dan menerima key valid', async () => {
    const { app } = createTestApp()
    const unauthorized = await app.request('/stats')
    expect(unauthorized.status).toBe(401)
    expect(await unauthorized.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key atau token login wajib dikirim' },
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
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(202)
    expect(messages.createOutgoing).toHaveBeenCalledOnce()
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('kirim pesan ditolak saat sesi belum terhubung', async () => {
    const { app, queue } = createTestApp({
      sessions: {
        get: vi.fn(async () => ({ ...SESSION, status: 'qr_pending' as const })),
      } as unknown as SessionsService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('replay clientRef saat sesi terputus mengembalikan pesan lama', async () => {
    const existing = {
      id: 'message-1',
      sessionId: SESSION_ID,
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'sent' as const,
      waMessageId: 'wa-1',
      error: null,
      customerName: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    const createOutgoing = vi.fn()
    const { app, queue } = createTestApp({
      sessions: {
        get: vi.fn(async () => ({ ...SESSION, status: 'disconnected' as const })),
      } as unknown as SessionsService,
      messages: {
        findByClientRef: vi.fn(async () => existing),
        createOutgoing,
      } as unknown as MessagesService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      duplicate: true,
      message: { id: 'message-1' },
    })
    expect(createOutgoing).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('token sesi salah ditolak', async () => {
    const { app, queue } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token-salah',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })

    expect(response.status).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('riwayat lintas sesi meneruskan filter arah pesan', async () => {
    const listAll = vi.fn(async () => ({ items: [], nextCursor: null }))
    const { app } = createTestApp({
      messages: { listAll } as unknown as MessagesService,
    })
    const response = await app.request('/messages?direction=out', {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(listAll).toHaveBeenCalledWith(50, undefined, undefined, 'out')
  })

  it('riwayat lintas sesi mengisi salesName dan null untuk pesan lama', async () => {
    const base = {
      id: 'm1',
      sessionId: SESSION_ID,
      to: '628123456789@s.whatsapp.net',
      clientRef: 'ref-1',
      body: 'Halo',
      status: 'sent' as const,
      waMessageId: null,
      error: null,
      customerName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
    }
    const listAll = vi.fn(async () => ({
      items: [
        { ...base, salesName: 'Sales A' },
        { ...base, id: 'm2', salesName: null },
      ],
      nextCursor: null,
    }))
    const { app } = createTestApp({
      messages: { listAll } as unknown as MessagesService,
    })
    const response = await app.request('/messages', { headers: { 'x-api-key': 'valid-key' } })

    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: { salesName: string | null }[] }
    expect(body.items[0]?.salesName).toBe('Sales A')
    expect(body.items[1]?.salesName).toBeNull()
  })

  it('riwayat sesi meneruskan filter arah pesan', async () => {
    const listBySession = vi.fn(async () => ({ items: [], nextCursor: null }))
    const { app } = createTestApp({
      messages: { listBySession } as unknown as MessagesService,
    })
    const response = await app.request(`/sessions/${SESSION_ID}/messages?direction=out`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(listBySession).toHaveBeenCalledWith(SESSION_ID, 20, undefined, 'out')
  })

  it('arah pesan tidak dikenal ditolak 422', async () => {
    const listAll = vi.fn()
    const { app } = createTestApp({
      messages: { listAll } as unknown as MessagesService,
    })
    const response = await app.request('/messages?direction=sideways', {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(422)
    expect(listAll).not.toHaveBeenCalled()
  })

  it('kirim ulang pesan gagal meng-enqueue job dengan id unik', async () => {
    const { app, queue, messages } = createTestApp()
    const response = await app.request('/messages/message-1/retry', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(202)
    expect(messages.retry).toHaveBeenCalledWith('message-1')
    expect(queue.add).toHaveBeenCalledWith(
      'send-message',
      { sessionId: SESSION_ID, messageId: 'message-1' },
      expect.objectContaining({
        jobId: expect.stringContaining('message-1-retry-'),
      }),
    )
  })

  it('kirim ulang ditolak tanpa API key', async () => {
    const { app, queue } = createTestApp()
    const response = await app.request('/messages/message-1/retry', { method: 'POST' })

    expect(response.status).toBe(401)
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('kirim ulang menolak pesan yang tidak berstatus gagal', async () => {
    const { app } = createTestApp({
      messages: {
        retry: vi.fn(async () => {
          throw new ValidationError('Hanya pesan berstatus gagal yang bisa dikirim ulang')
        }),
      } as unknown as MessagesService,
    })
    const response = await app.request('/messages/message-1/retry', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    })
  })

  it('live menggabungkan session, qr, pairing code, dan broadcast', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/sessions/${SESSION_ID}/live`, {
      headers: { 'x-api-key': 'valid-key' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      session: { id: SESSION_ID, status: 'connected' },
      qr: null,
      pairingCode: null,
      broadcast: { jobId: null, total: 0, recipients: [] },
      defaultDelay: { min: 10, max: 30 },
    })
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
        updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
          ...pairingSession,
          status,
          ...patch,
        })),
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

  it('rate limit sales memakai kuota per user', async () => {
    const counts = new Map<string, number>()
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1
        counts.set(key, next)
        return next
      }),
      expire: vi.fn(async () => 1),
    } as unknown as RedisClient

    const userAuth = {
      authenticate: vi.fn(async (token: string) => {
        if (token === USER_TOKEN) return AUTH_USER
        if (token === 'token-sales-b') {
          return { ...AUTH_USER, id: 'user-2', name: 'Sales B', phoneNumber: '628987654321' }
        }
        return null
      }),
    } as unknown as AuthService

    const { app } = createTestApp({
      redis,
      userAuth,
      env: { ...TEST_ENV, RATE_LIMIT_PER_MIN: 2 },
    })

    for (let i = 0; i < 2; i += 1) {
      const response = await app.request('/sessions', {
        headers: { authorization: `Bearer ${USER_TOKEN}` },
      })
      expect(response.status).toBe(200)
    }

    const limited = await app.request('/sessions', {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('60')

    const other = await app.request('/sessions', {
      headers: { authorization: 'Bearer token-sales-b' },
    })
    expect(other.status).toBe(200)
  })

  it('sales ditolak 403 di seluruh endpoint admin sesi', async () => {
    const { app } = createTestApp()
    const headers = { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' }

    const requests = [
      app.request('/sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({ label: 'Sales Baru' }),
      }),
      app.request(`/sessions/${SESSION_ID}`, { method: 'DELETE', headers }),
      app.request(`/sessions/${SESSION_ID}/token`, { method: 'POST', headers }),
      app.request(`/sessions/${SESSION_ID}/logout`, { method: 'POST', headers }),
    ]

    for (const response of await Promise.all(requests)) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    }
  })

  it('sales hanya bisa membaca sesi miliknya', async () => {
    const { app } = createTestApp()
    const headers = { authorization: `Bearer ${USER_TOKEN}` }

    for (const path of [
      `/sessions/${SESSION_ID}`,
      `/sessions/${SESSION_ID}/status`,
      `/sessions/${SESSION_ID}/qr`,
      `/sessions/${SESSION_ID}/live`,
      `/sessions/${SESSION_ID}/pairing`,
    ]) {
      const response = await app.request(path, { headers })
      expect(response.status).toBe(200)
    }
  })

  it('sales bisa memulai dan membatalkan pairing sesi miliknya', async () => {
    const pairingSession = { ...SESSION, status: 'qr_pending' as const, lastQr: 'data:image/png' }
    const { app } = createTestApp({
      sessions: {
        get: vi.fn(async () => pairingSession),
        updateStatus: vi.fn(async (_id: string, status: WaSessionRow['status'], patch = {}) => ({
          ...pairingSession,
          status,
          ...patch,
        })),
      } as unknown as SessionsService,
    })
    const headers = { authorization: `Bearer ${USER_TOKEN}` }

    expect(
      (await app.request(`/sessions/${SESSION_ID}/login`, { method: 'POST', headers })).status,
    ).toBe(200)
    expect(
      (await app.request(`/sessions/${SESSION_ID}/cancel`, { method: 'POST', headers })).status,
    ).toBe(200)
  })

  it('pairing dengan kode dinonaktifkan untuk admin maupun sales', async () => {
    const { app } = createTestApp()
    const authHeaders = [{ 'x-api-key': 'valid-key' }, { authorization: `Bearer ${USER_TOKEN}` }]

    for (const auth of authHeaders) {
      const response = await app.request(`/sessions/${SESSION_ID}/pairing`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ phoneNumber: '628123456789' }),
      })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: { code: 'CONFLICT' } })
    }
  })

  it('sales ditolak 403 saat membaca sesi milik sales lain atau sesi lama', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const { app } = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const headers = { authorization: `Bearer ${USER_TOKEN}` }

    for (const path of [
      `/sessions/${SESSION_ID}`,
      `/sessions/${SESSION_ID}/status`,
      `/sessions/${SESSION_ID}/qr`,
      `/sessions/${SESSION_ID}/live`,
      `/sessions/${SESSION_ID}/pairing`,
    ]) {
      const response = await app.request(path, { headers })
      expect(response.status).toBe(403)
      const body = (await response.json()) as { error: { message: string } }
      expect(body.error.message).not.toContain(otherSession.publicId)
      expect(body.error.message).not.toContain('user-2')
    }

    for (const path of [`/sessions/${SESSION_ID}/login`, `/sessions/${SESSION_ID}/cancel`]) {
      const response = await app.request(path, { method: 'POST', headers })
      expect(response.status, path).toBe(403)
    }
  })

  it('admin tetap bisa membaca semua sesi', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const { app } = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const headers = { 'x-api-key': 'valid-key' }

    for (const path of [
      `/sessions/${SESSION_ID}`,
      `/sessions/${SESSION_ID}/status`,
      `/sessions/${SESSION_ID}/qr`,
      `/sessions/${SESSION_ID}/live`,
      `/sessions/${SESSION_ID}/pairing`,
    ]) {
      const response = await app.request(path, { headers })
      expect(response.status).toBe(200)
    }
  })

  it('detail sesi mengisi salesName dan null untuk sesi lama', async () => {
    const owned = createTestApp({
      sessions: {
        get: vi.fn(async () => ({ ...SESSION, salesName: 'Sales A' })),
      } as unknown as SessionsService,
    })
    const ownedResponse = await owned.app.request(`/sessions/${SESSION_ID}`, {
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(await ownedResponse.json()).toMatchObject({ salesName: 'Sales A' })

    const legacy = createTestApp()
    const legacyResponse = await legacy.app.request(`/sessions/${SESSION_ID}`, {
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(await legacyResponse.json()).toMatchObject({ salesName: null })
  })

  it('matriks endpoint admin menolak sales dan tamu', async () => {
    const { app } = createTestApp()
    const endpoints: { method: string; path: string; body?: string }[] = [
      { method: 'POST', path: '/sessions', body: JSON.stringify({ label: 'Baru' }) },
      { method: 'DELETE', path: `/sessions/${SESSION_ID}` },
      { method: 'POST', path: `/sessions/${SESSION_ID}/token` },
      { method: 'POST', path: `/sessions/${SESSION_ID}/logout` },
      {
        method: 'PATCH',
        path: `/sessions/${SESSION_ID}/sales`,
        body: JSON.stringify({ salesName: 'Budi', pin: '123456' }),
      },
      {
        method: 'POST',
        path: `/sessions/${SESSION_ID}/sales/pin`,
        body: JSON.stringify({ pin: '654321' }),
      },
      { method: 'GET', path: '/messages' },
      { method: 'DELETE', path: '/messages/m1' },
      { method: 'POST', path: '/messages/m1/retry' },
      { method: 'GET', path: '/stats' },
      { method: 'GET', path: '/settings' },
      { method: 'PATCH', path: '/settings', body: JSON.stringify({ maxSales: 5 }) },
      { method: 'GET', path: '/v1/webhooks' },
    ]

    for (const endpoint of endpoints) {
      const sales = await app.request(endpoint.path, {
        method: endpoint.method,
        headers: { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' },
        body: endpoint.body,
      })
      expect(sales.status, `${endpoint.method} ${endpoint.path} sales`).toBe(403)

      const guest = await app.request(endpoint.path, {
        method: endpoint.method,
        headers: { 'content-type': 'application/json' },
        body: endpoint.body,
      })
      expect(guest.status, `${endpoint.method} ${endpoint.path} tamu`).toBe(401)
    }
  })

  it('endpoint scoped menolak tamu dengan 401', async () => {
    const { app } = createTestApp()

    for (const path of [
      `/sessions/${SESSION_ID}`,
      `/sessions/${SESSION_ID}/status`,
      `/sessions/${SESSION_ID}/qr`,
      `/sessions/${SESSION_ID}/live`,
      `/sessions/${SESSION_ID}/pairing`,
      `/v1/sessions/${SESSION.publicId}/conversations`,
      '/v1/conversations/c1/messages',
      `/v1/sessions/${SESSION.publicId}/events`,
    ]) {
      const response = await app.request(path)
      expect(response.status, path).toBe(401)
    }
  })

  it('admin tetap bisa memakai endpoint tulis sesi dan riwayat', async () => {
    const { app } = createTestApp()
    const headers = { 'x-api-key': 'valid-key', 'content-type': 'application/json' }

    const create = await app.request('/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ label: 'Baru' }),
    })
    expect(create.status).toBe(201)

    expect(
      (await app.request(`/sessions/${SESSION_ID}/token`, { method: 'POST', headers })).status,
    ).toBe(200)
    expect(
      (await app.request(`/sessions/${SESSION_ID}/logout`, { method: 'POST', headers })).status,
    ).toBe(200)
    expect(
      (
        await app.request(`/sessions/${SESSION_ID}/pairing`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ phoneNumber: '628123456789' }),
        })
      ).status,
    ).toBe(409)
    expect(
      (await app.request(`/sessions/${SESSION_ID}`, { method: 'DELETE', headers })).status,
    ).toBe(204)
    expect((await app.request('/messages', { headers })).status).toBe(200)
    expect((await app.request('/messages/m1', { method: 'DELETE', headers })).status).toBe(204)
  })

  it('response sesi tidak memuat token atau hash sensitif', async () => {
    const { app } = createTestApp()

    for (const path of ['/sessions', `/sessions/${SESSION_ID}`]) {
      const response = await app.request(path, { headers: { 'x-api-key': 'valid-key' } })
      expect(response.status).toBe(200)
      const text = JSON.stringify(await response.json())
      expect(text).not.toContain(SESSION.tokenHash ?? '')
      expect(text).not.toContain('tokenHash')
      expect(text).not.toContain('pinHash')
    }
  })

  it('GET /settings mengembalikan maxSales, salesCount, dan default delay untuk admin', async () => {
    const { app } = createTestApp()
    const response = await app.request('/settings', { headers: { 'x-api-key': 'valid-key' } })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      maxSales: 10,
      salesCount: 2,
      defaultMinDelay: 10,
      defaultMaxDelay: 30,
    })
  })

  it('PATCH /settings menyimpan maxSales dan default delay, menolak nilai tidak valid', async () => {
    const { app, settings } = createTestApp()
    const headers = { 'x-api-key': 'valid-key', 'content-type': 'application/json' }

    const ok = await app.request('/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ maxSales: 25 }),
    })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({
      maxSales: 25,
      salesCount: 2,
      defaultMinDelay: 10,
      defaultMaxDelay: 30,
    })
    expect(settings.updateSettings).toHaveBeenCalledWith({ maxSales: 25 })

    const delay = await app.request('/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ defaultMinDelay: 15, defaultMaxDelay: 45 }),
    })
    expect(delay.status).toBe(200)
    expect(await delay.json()).toMatchObject({ defaultMinDelay: 15, defaultMaxDelay: 45 })
    expect(settings.updateSettings).toHaveBeenCalledWith({
      defaultMinDelay: 15,
      defaultMaxDelay: 45,
    })

    for (const maxSales of [0, 101]) {
      const invalid = await app.request('/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ maxSales }),
      })
      expect(invalid.status).toBe(422)
    }

    const invalidRange = await app.request('/settings', {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ defaultMinDelay: 60, defaultMaxDelay: 30 }),
    })
    expect(invalidRange.status).toBe(422)
  })

  it('POST /sessions meneruskan salesName + PIN dan tidak membocorkan PIN', async () => {
    const { app, sessions } = createTestApp()
    const response = await app.request('/sessions', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        label: 'Sales A',
        salesName: 'Budi',
        phoneNumber: '628123456789',
        pin: '123456',
      }),
    })

    expect(response.status).toBe(201)
    expect(sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        salesName: 'Budi',
        pin: '123456',
        phoneNumber: '628123456789',
      }),
    )
    expect(JSON.stringify(await response.json())).not.toContain('123456')
  })

  it('POST /sessions menolak salesName tanpa PIN dengan 422', async () => {
    const { app, sessions } = createTestApp()
    const response = await app.request('/sessions', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'Sales A', salesName: 'Budi', phoneNumber: '628123456789' }),
    })

    expect(response.status).toBe(422)
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('admin bisa reset PIN dan menautkan sales tanpa membocorkan PIN', async () => {
    const { app, sessions } = createTestApp()
    const headers = { 'x-api-key': 'valid-key', 'content-type': 'application/json' }

    const attach = await app.request(`/sessions/${SESSION_ID}/sales`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ salesName: 'Budi', pin: '123456' }),
    })
    expect(attach.status).toBe(200)
    expect(sessions.attachSales).toHaveBeenCalledWith(SESSION_ID, {
      salesName: 'Budi',
      pin: '123456',
    })
    expect(JSON.stringify(await attach.json())).not.toContain('123456')

    const reset = await app.request(`/sessions/${SESSION_ID}/sales/pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin: '654321' }),
    })
    expect(reset.status).toBe(200)
    expect(sessions.resetSalesPin).toHaveBeenCalledWith(SESSION_ID, '654321')
    expect(JSON.stringify(await reset.json())).not.toContain('654321')
  })

  it('reset PIN dan tautkan sales menolak PIN tidak valid dengan 422', async () => {
    const { app, sessions } = createTestApp()
    const headers = { 'x-api-key': 'valid-key', 'content-type': 'application/json' }

    const attach = await app.request(`/sessions/${SESSION_ID}/sales`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ salesName: 'Budi', pin: '123' }),
    })
    expect(attach.status).toBe(422)
    expect(sessions.attachSales).not.toHaveBeenCalled()

    const reset = await app.request(`/sessions/${SESSION_ID}/sales/pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin: '123456789' }),
    })
    expect(reset.status).toBe(422)
    expect(sessions.resetSalesPin).not.toHaveBeenCalled()
  })

  it('GET /docs menyajikan referensi Scalar sebagai HTML', async () => {
    const { app } = createTestApp()
    const response = await app.request('/docs')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('Scalar')
  })

  it('GET /openapi.json memuat path dan security scheme dari route', async () => {
    const { app } = createTestApp()
    const response = await app.request('/openapi.json')

    expect(response.status).toBe(200)
    const document = (await response.json()) as {
      openapi: string
      info: { description: string }
      paths: Record<string, unknown>
      components: { securitySchemes: Record<string, { type: string }> }
    }

    expect(document.openapi).toBe('3.1.0')
    expect(document.paths).toHaveProperty('/sessions')
    expect(document.paths).toHaveProperty('/auth/login')
    expect(document.paths).toHaveProperty('/auth/me')
    expect(document.paths).toHaveProperty('/auth/logout')
    expect(document.paths).toHaveProperty('/sessions/{id}/live')
    expect(document.paths).toHaveProperty('/sessions/{id}/sales')
    expect(document.paths).toHaveProperty('/sessions/{id}/sales/pin')
    expect(document.paths).toHaveProperty('/messages')
    expect(document.paths).toHaveProperty('/stats')
    expect(document.paths).toHaveProperty('/settings')
    expect(document.paths).toHaveProperty('/v1/conversations/{id}/messages')
    expect(document.paths).toHaveProperty('/v1/broadcasts')
    expect(document.paths).toHaveProperty('/v1/webhooks')
    expect(document.components.securitySchemes.ApiKey?.type).toBe('apiKey')
    expect(document.components.securitySchemes.SessionToken?.type).toBe('http')
    expect(document.components.securitySchemes.UserToken?.type).toBe('http')
    expect(document.info.description).toContain('X-Signature: sha256=')
    expect(document.info.description).toContain('message.received')
    expect(document.info.description).toContain('broadcast.recipient')
  })

  describe('katalog endpoint consumer', () => {
    it('setiap entri CONSUMER_ENDPOINTS ada di dokumen OpenAPI', () => {
      const { app } = createTestApp()
      const document = app.getOpenAPI31Document(openApiDocumentConfig)
      const paths = document.paths ?? {}

      for (const endpoint of CONSUMER_ENDPOINTS) {
        const item = paths[endpoint.path]
        expect(item, `${endpoint.method} ${endpoint.path} tidak ada di OpenAPI`).toBeDefined()
        expect(Object.keys(item ?? {})).toContain(endpoint.method.toLowerCase())
      }
    })

    it('tidak memasukkan endpoint dashboard internal ke katalog', () => {
      const keys = CONSUMER_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`)

      expect(keys).not.toContain('POST /auth/login')
      expect(keys.filter((key) => / (\/auth|\/settings|\/stats)(\/|$)/.test(key))).toEqual([])
    })
  })

  it('GET /sessions tanpa kredensial tetap 401 dengan format error yang sama', async () => {
    const { app } = createTestApp()
    const response = await app.request('/sessions')

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'API key atau token login wajib dikirim' },
    })
  })

  it('GET /sessions menerima API key admin dan token login sales', async () => {
    const { app } = createTestApp()

    const admin = await app.request('/sessions', { headers: { 'x-api-key': 'valid-key' } })
    expect(admin.status).toBe(200)

    const sales = await app.request('/sessions', {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })
    expect(sales.status).toBe(200)
  })

  it('GET /sessions memakai filter owner untuk sales dan tanpa filter untuk admin', async () => {
    const { app, sessions } = createTestApp()

    await app.request('/sessions', { headers: { 'x-api-key': 'valid-key' } })
    expect(sessions.list).toHaveBeenLastCalledWith(50, undefined)

    await app.request('/sessions', {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })
    expect(sessions.list).toHaveBeenLastCalledWith(50, 'user-1')
  })

  it('token login sales yang kedaluwarsa atau dicabut ditolak 401', async () => {
    const { app } = createTestApp({
      userAuth: {
        authenticate: async () => null,
      } as unknown as AuthService,
    })
    const response = await app.request('/sessions', {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('API key yang dicabut ditolak 401', async () => {
    const { app } = createTestApp({
      auth: { findActive: async () => null },
    })
    const response = await app.request('/sessions', { headers: { 'x-api-key': 'dicabut' } })

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('sales bisa membaca dan mengirim pesan sesi miliknya', async () => {
    const { app, messages } = createTestApp()
    const headers = { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' }

    const list = await app.request(`/sessions/${SESSION_ID}/messages?direction=out`, { headers })
    expect(list.status).toBe(200)
    expect(messages.listBySession).toHaveBeenCalledWith(SESSION_ID, 20, undefined, 'out')

    const sent = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })
    expect(sent.status).toBe(202)
  })

  it('sales ditolak 403 saat membuka pesan sesi milik sales lain', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const listBySession = vi.fn(async () => ({ items: [], nextCursor: null }))
    const createOutgoing = vi.fn()
    const { app } = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
      messages: { listBySession, createOutgoing } as unknown as MessagesService,
    })
    const headers = { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' }

    const list = await app.request(`/sessions/${SESSION_ID}/messages`, { headers })
    expect(list.status).toBe(403)

    const sent = await app.request(`/sessions/${SESSION_ID}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: '628123456789', clientRef: 'ref-1', text: 'Halo' }),
    })
    expect(sent.status).toBe(403)
    expect(listBySession).not.toHaveBeenCalled()
    expect(createOutgoing).not.toHaveBeenCalled()
  })

  it('sales bisa memakai broadcast sesi miliknya', async () => {
    const broadcast = { id: 'b1', sessionId: SESSION_ID, status: 'pending' as const }
    const broadcasts = {
      create: vi.fn(async () => ({ broadcast, duplicate: false })),
      current: vi.fn(async () => null),
      detail: vi.fn(async () => ({ sessionId: SESSION_ID })),
      get: vi.fn(async () => broadcast),
      start: vi.fn(async () => broadcast),
      pause: vi.fn(async () => broadcast),
      cancel: vi.fn(async () => broadcast),
    } as unknown as AppDependencies['broadcasts']
    const { app } = createTestApp({ broadcasts })
    const headers = { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' }
    const body = JSON.stringify({
      sessionId: SESSION.publicId,
      recipients: [{ to: '628123456789' }],
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'b1',
    })

    expect((await app.request('/v1/broadcasts', { method: 'POST', headers, body })).status).toBe(
      202,
    )
    expect(
      (await app.request(`/sessions/${SESSION_ID}/broadcast/current`, { headers })).status,
    ).toBe(200)
    expect((await app.request('/v1/broadcasts/b1', { headers })).status).toBe(200)
    expect((await app.request('/v1/broadcasts/b1/start', { method: 'POST', headers })).status).toBe(
      200,
    )
    expect((await app.request('/v1/broadcasts/b1/pause', { method: 'POST', headers })).status).toBe(
      200,
    )
    expect(
      (await app.request(`/sessions/${SESSION_ID}/broadcast/cancel`, { method: 'POST', headers }))
        .status,
    ).toBe(200)
  })

  it('sales ditolak 403 saat memakai broadcast sesi milik sales lain', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const broadcasts = {
      create: vi.fn(),
      current: vi.fn(),
      detail: vi.fn(async () => ({ sessionId: SESSION_ID })),
      get: vi.fn(async () => ({ id: 'b1', sessionId: SESSION_ID })),
      start: vi.fn(),
      pause: vi.fn(),
      cancel: vi.fn(),
    } as unknown as AppDependencies['broadcasts']
    const { app } = createTestApp({
      broadcasts,
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const headers = { authorization: `Bearer ${USER_TOKEN}`, 'content-type': 'application/json' }
    const body = JSON.stringify({
      sessionId: SESSION.publicId,
      recipients: [{ to: '628123456789' }],
      text: 'Halo',
      minDelay: 10,
      maxDelay: 20,
      clientRef: 'b1',
    })

    expect((await app.request('/v1/broadcasts', { method: 'POST', headers, body })).status).toBe(
      403,
    )
    expect((await app.request('/v1/broadcasts/b1', { headers })).status).toBe(403)
    expect((await app.request('/v1/broadcasts/b1/start', { method: 'POST', headers })).status).toBe(
      403,
    )
    expect((await app.request('/v1/broadcasts/b1/pause', { method: 'POST', headers })).status).toBe(
      403,
    )
    expect(
      (await app.request(`/sessions/${SESSION_ID}/broadcast/current`, { headers })).status,
    ).toBe(403)
    expect(
      (await app.request(`/sessions/${SESSION_ID}/broadcast/cancel`, { method: 'POST', headers }))
        .status,
    ).toBe(403)
    expect(broadcasts.create).not.toHaveBeenCalled()
    expect(broadcasts.start).not.toHaveBeenCalled()
    expect(broadcasts.pause).not.toHaveBeenCalled()
    expect(broadcasts.cancel).not.toHaveBeenCalled()
  })

  it('POST /sessions dengan body tidak valid mengembalikan 422 VALIDATION_ERROR', async () => {
    const { app } = createTestApp()
    const response = await app.request('/sessions', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({ label: '' }),
    })

    expect(response.status).toBe(422)
    const body = (await response.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('daftar room chat memakai public_id sesi dan API key', async () => {
    const { app, conversations } = createTestApp()
    const unauthorized = await app.request(`/v1/sessions/${SESSION.publicId}/conversations`)
    expect(unauthorized.status).toBe(401)

    const response = await app.request(`/v1/sessions/${SESSION.publicId}/conversations`, {
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ items: [], nextCursor: null })
    expect(conversations.listRooms).toHaveBeenCalledWith(SESSION_ID, 20, undefined)
  })

  it('menandai room dibaca dan mengirim pesan lewat /v1', async () => {
    const { app, conversations, queue, messages } = createTestApp()

    const read = await app.request('/v1/conversations/c1/read', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(read.status).toBe(200)
    expect(conversations.markRead).toHaveBeenCalledWith('c1')

    const sent = await app.request('/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId: SESSION.publicId,
        to: '628123456789',
        text: 'Halo',
        clientRef: 'inbox-1',
      }),
    })
    expect(sent.status).toBe(202)
    expect(messages.createOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID, clientRef: 'inbox-1' }),
    )
    expect(queue.add).toHaveBeenCalledOnce()
  })

  it('sales hanya bisa membuka inbox sesi miliknya', async () => {
    const headers = { authorization: `Bearer ${USER_TOKEN}` }
    const own = await createTestApp().app.request(
      `/v1/sessions/${SESSION.publicId}/conversations`,
      {
        headers,
      },
    )
    expect(own.status).toBe(200)

    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const other = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    }).app
    const denied = await other.request(`/v1/sessions/${SESSION.publicId}/conversations`, {
      headers,
    })
    expect(denied.status).toBe(403)
  })

  it('sales ditolak 403 di room chat milik sesi lain', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const conversation = {
      id: 'c1',
      sessionId: 'sesi-lain',
      waJid: '628123456789@s.whatsapp.net',
      waJidAlt: null,
      lastMessageAt: null,
      unreadCount: 0,
    }
    const { app } = createTestApp({
      conversations: {
        get: vi.fn(async () => conversation),
      } as unknown as AppDependencies['conversations'],
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const headers = { authorization: `Bearer ${USER_TOKEN}` }

    const messages = await app.request('/v1/conversations/c1/messages', { headers })
    expect(messages.status).toBe(403)

    const read = await app.request('/v1/conversations/c1/read', { method: 'POST', headers })
    expect(read.status).toBe(403)
  })

  it('sales hanya bisa mengirim pesan /v1 untuk sesinya sendiri', async () => {
    const headers = {
      authorization: `Bearer ${USER_TOKEN}`,
      'content-type': 'application/json',
    }
    const body = JSON.stringify({
      sessionId: SESSION.publicId,
      to: '628123456789',
      text: 'Halo',
      clientRef: 's1',
    })

    const own = createTestApp()
    const sent = await own.app.request('/v1/messages', { method: 'POST', headers, body })
    expect(sent.status).toBe(202)
    expect(own.messages.createOutgoing).toHaveBeenCalledOnce()

    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const other = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const denied = await other.app.request('/v1/messages', { method: 'POST', headers, body })
    expect(denied.status).toBe(403)
    expect(other.messages.createOutgoing).not.toHaveBeenCalled()
  })

  it('SSE menolak sales di sesi milik sales lain', async () => {
    const otherSession = { ...SESSION, ownerUserId: 'user-2' }
    const { app } = createTestApp({
      sessions: {
        get: vi.fn(async () => otherSession),
        getByPublicId: vi.fn(async () => otherSession),
      } as unknown as SessionsService,
    })
    const response = await app.request(`/v1/sessions/${SESSION.publicId}/events`, {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })

    expect(response.status).toBe(403)
  })

  it('SSE menolak request tanpa API key', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/v1/sessions/${SESSION.publicId}/events`)
    expect(response.status).toBe(401)
  })

  it('POST /auth/login publik mengembalikan token tanpa hash', async () => {
    const { app } = createTestApp()
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: AUTH_USER.phoneNumber, pin: '123456' }),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      token: USER_TOKEN,
      expiresAt: '2026-12-01T00:00:00.000Z',
      user: { id: 'user-1', role: 'sales', active: true },
    })
    expect(JSON.stringify(body)).not.toContain('pinHash')
    expect(JSON.stringify(body)).not.toContain('tokenHash')
  })

  it('POST /auth/login memakai pesan generik dan NO_SESSION terpisah', async () => {
    const { app } = createTestApp()
    const wrong = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: AUTH_USER.phoneNumber, pin: '654321' }),
    })
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Nomor atau PIN salah' },
    })

    const noSession = createTestApp({
      userAuth: {
        login: async () => {
          throw new NoSessionError()
        },
      } as unknown as AuthService,
    })
    const response = await noSession.app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: AUTH_USER.phoneNumber, pin: '123456' }),
    })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: 'NO_SESSION' } })
  })

  it('POST /auth/login menolak PIN atau nomor tidak valid dengan 422', async () => {
    const { app } = createTestApp()
    const response = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber: '6281 2345', pin: '123' }),
    })
    expect(response.status).toBe(422)
  })

  it('GET /auth/me membedakan admin dan sales serta menolak tanpa kredensial', async () => {
    const { app } = createTestApp()

    const admin = await app.request('/auth/me', { headers: { 'x-api-key': 'valid-key' } })
    expect(admin.status).toBe(200)
    expect(await admin.json()).toEqual({ mode: 'admin', user: null })

    const sales = await app.request('/auth/me', {
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })
    expect(sales.status).toBe(200)
    const body = (await sales.json()) as { mode: string; user: Record<string, unknown> }
    expect(body.mode).toBe('sales')
    expect(body.user).toMatchObject({ id: 'user-1', name: 'Sales A' })
    expect(body.user).not.toHaveProperty('pinHash')

    const anonymous = await app.request('/auth/me')
    expect(anonymous.status).toBe(401)

    const invalid = await app.request('/auth/me', {
      headers: { authorization: 'Bearer token-salah' },
    })
    expect(invalid.status).toBe(401)
  })

  it('rate limit login menolak percobaan ke-6 per nomor', async () => {
    const counts = new Map<string, number>()
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1
        counts.set(key, next)
        return next
      }),
      expire: vi.fn(async () => 1),
    } as unknown as RedisClient
    const { app } = createTestApp({ redis })

    for (let i = 0; i < 5; i += 1) {
      const response = await attemptLogin(app, '628111111111', '10.0.0.1')
      expect(response.status).toBe(401)
    }

    const limited = await attemptLogin(app, '628111111111', '10.0.0.1')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('300')
    const body = (await limited.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('RATE_LIMITED')
    expect(body.error.message).not.toContain('628111111111')

    const otherPhone = await attemptLogin(app, '628222222222', '10.0.0.2')
    expect(otherPhone.status).toBe(401)

    const otherIpSamePhone = await attemptLogin(app, '628111111111', '10.0.0.3')
    expect(otherIpSamePhone.status).toBe(429)
  })

  it('rate limit login juga membatasi per IP', async () => {
    const counts = new Map<string, number>()
    const redis = {
      incr: vi.fn(async (key: string) => {
        const next = (counts.get(key) ?? 0) + 1
        counts.set(key, next)
        return next
      }),
      expire: vi.fn(async () => 1),
    } as unknown as RedisClient
    const { app } = createTestApp({ redis })

    for (let i = 0; i < 5; i += 1) {
      const response = await attemptLogin(
        app,
        `6281234567${String(i).padStart(2, '0')}`,
        '10.1.0.1',
      )
      expect(response.status).toBe(401)
    }

    const limited = await attemptLogin(app, '628999999999', '10.1.0.1')
    expect(limited.status).toBe(429)
  })

  it('POST /auth/logout mencabut token sales dan idempoten untuk admin', async () => {
    const { app, userAuth } = createTestApp()

    const sales = await app.request('/auth/logout', {
      method: 'POST',
      headers: { authorization: `Bearer ${USER_TOKEN}` },
    })
    expect(sales.status).toBe(204)
    expect(userAuth.logout).toHaveBeenCalledWith(USER_TOKEN)

    const admin = await app.request('/auth/logout', {
      method: 'POST',
      headers: { 'x-api-key': 'valid-key' },
    })
    expect(admin.status).toBe(204)
    expect(userAuth.logout).toHaveBeenCalledOnce()
  })
})
