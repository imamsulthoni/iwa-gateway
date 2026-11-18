import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  SESSION_STATUS_LABELS,
  apiErrorBody,
  createSessionSchema,
  pairingRequestSchema,
  pairingResponseSchema,
  qrResponseSchema,
  sessionListSchema,
  sessionLiveSchema,
  sessionSchema,
  sessionStatusSchema,
  sessionTokenSchema,
  type BroadcastCurrentDto,
  type SessionLiveDto,
  type PairingResponseDto,
} from '@wa/shared'
import type { Redis } from 'ioredis'

import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import { toSessionDto } from '../../modules/sessions/service.js'
import { publishSessionControl } from '../../infra/session-control.js'
import type { AppBindings } from '../app.js'
import { ensureSessionAccess, requireAdmin } from '../middleware/auth.js'
import { idParamSchema, openApiError } from '../openapi.js'

const EMPTY_BROADCAST: BroadcastCurrentDto = {
  jobId: null,
  status: null,
  total: 0,
  done: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  optedOut: 0,
  scheduledAt: null,
  pauseReason: null,
  recipients: [],
}

const apiKeySecurity = [{ ApiKey: [] }]
const anyAuthSecurity: Record<string, string[]>[] = [{ ApiKey: [] }, { UserToken: [] }]

const listSessionsRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Sessions'],
  summary: 'Daftar sesi WhatsApp',
  security: anyAuthSecurity,
  responses: {
    200: {
      description: 'Maksimal 50 sesi terbaru',
      content: { 'application/json': { schema: sessionListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const createSessionRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['Sessions'],
  summary: 'Buat sesi baru',
  security: apiKeySecurity,
  request: {
    body: {
      content: { 'application/json': { schema: createSessionSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Sesi dibuat beserta token sesi',
      content: { 'application/json': { schema: sessionTokenSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    409: openApiError('publicId atau nomor sudah dipakai sesi lain'),
    422: openApiError('Data sesi tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const getSessionRoute = createRoute({
  method: 'get',
  path: '/{id}',
  tags: ['Sessions'],
  summary: 'Detail satu sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Detail sesi',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const deleteSessionRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Sessions'],
  summary: 'Hapus sesi',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Sesi dihapus' },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const loginSessionRoute = createRoute({
  method: 'post',
  path: '/{id}/login',
  tags: ['Sessions'],
  summary: 'Mulai koneksi WhatsApp untuk sesi',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Sesi masuk status connecting',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const cancelSessionRoute = createRoute({
  method: 'post',
  path: '/{id}/cancel',
  tags: ['Sessions'],
  summary: 'Batalkan proses pairing',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Sesi diputus dan QR dikosongkan',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    409: openApiError('Sesi tidak sedang dalam proses pairing'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const logoutSessionRoute = createRoute({
  method: 'post',
  path: '/{id}/logout',
  tags: ['Sessions'],
  summary: 'Logout sesi dan hapus auth tersimpan',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Sesi berstatus logged_out',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const rotateSessionTokenRoute = createRoute({
  method: 'post',
  path: '/{id}/token',
  tags: ['Sessions'],
  summary: 'Rotasi token sesi',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Token sesi baru',
      content: { 'application/json': { schema: sessionTokenSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const sessionStatusRoute = createRoute({
  method: 'get',
  path: '/{id}/status',
  tags: ['Sessions'],
  summary: 'Status ringkas sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Status sesi',
      content: { 'application/json': { schema: sessionStatusSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const sessionQrRoute = createRoute({
  method: 'get',
  path: '/{id}/qr',
  tags: ['Sessions'],
  summary: 'QR terakhir sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'QR (data URL) dan status sesi',
      content: { 'application/json': { schema: qrResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const sessionLiveRoute = createRoute({
  method: 'get',
  path: '/{id}/live',
  tags: ['Sessions'],
  summary: 'Gabungan state dashboard sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Sesi, QR, pairing code, dan broadcast aktif',
      content: { 'application/json': { schema: sessionLiveSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const pairingCodeRoute = createRoute({
  method: 'get',
  path: '/{id}/pairing',
  tags: ['Sessions'],
  summary: 'Pairing code terakhir sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Pairing code dan status sesi',
      content: { 'application/json': { schema: pairingResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const requestPairingCodeRoute = createRoute({
  method: 'post',
  path: '/{id}/pairing',
  tags: ['Sessions'],
  summary: 'Minta pairing code untuk nomor tertentu',
  security: apiKeySecurity,
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: pairingRequestSchema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Permintaan pairing diterima; code diisi worker secara asinkron',
      content: { 'application/json': { schema: pairingResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    409: openApiError('Nomor sudah dipakai sesi lain'),
    422: openApiError('Nomor tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createSessionsRoute(
  sessions: SessionsService,
  broadcasts: BroadcastsService,
  redis: Redis,
) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(listSessionsRoute, async (c) => {
    const actor = c.get('actor')
    const ownerUserId = actor?.mode === 'sales' ? actor.user.id : undefined
    const rows = await sessions.list(50, ownerUserId)
    return c.json({ items: rows.map(toSessionDto), nextCursor: null }, 200)
  })

  router.openapi(createSessionRoute, async (c) => {
    requireAdmin(c)
    const input = c.req.valid('json')
    if (input.mode === 'pairing' && !input.phoneNumber) {
      return c.json(
        apiErrorBody('VALIDATION_ERROR', 'Mode pairing wajib menyertakan phoneNumber'),
        422,
      )
    }
    const { session, token } = await sessions.create(input)
    return c.json({ token, session: toSessionDto(session) }, 201)
  })

  router.openapi(getSessionRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    return c.json(toSessionDto(session), 200)
  })

  router.openapi(deleteSessionRoute, async (c) => {
    requireAdmin(c)
    await sessions.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  router.openapi(loginSessionRoute, async (c) => {
    requireAdmin(c)
    const session = await sessions.updateStatus(c.req.param('id'), 'connecting')
    await publishSessionControl(redis, { sessionId: session.id, action: 'start' })
    return c.json(toSessionDto(session), 200)
  })

  router.openapi(cancelSessionRoute, async (c) => {
    requireAdmin(c)
    const session = await sessions.get(c.req.param('id'))
    if (session.status === 'connected' || session.status === 'logged_out') {
      return c.json(apiErrorBody('CONFLICT', 'Sesi tidak sedang dalam proses pairing'), 409)
    }
    const updated = await sessions.updateStatus(session.id, 'disconnected', { lastQr: null })
    await publishSessionControl(redis, {
      sessionId: updated.id,
      action: 'stop',
      clearAuth: true,
    })
    return c.json(toSessionDto(updated), 200)
  })

  router.openapi(logoutSessionRoute, async (c) => {
    requireAdmin(c)
    const session = await sessions.updateStatus(c.req.param('id'), 'logged_out', { lastQr: null })
    await publishSessionControl(redis, { sessionId: session.id, action: 'stop', clearAuth: true })
    return c.json(toSessionDto(session), 200)
  })

  router.openapi(rotateSessionTokenRoute, async (c) => {
    requireAdmin(c)
    const { session, token } = await sessions.rotateToken(c.req.param('id'))
    return c.json({ token, session: toSessionDto(session) }, 200)
  })

  router.openapi(sessionStatusRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    return c.json(
      {
        status: session.status,
        statusLabel: SESSION_STATUS_LABELS[session.status],
        phoneNumber: session.phoneNumber,
        salesId: session.salesId,
        agentId: session.agentId,
      },
      200,
    )
  })

  router.openapi(sessionQrRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    return c.json({ qr: session.lastQr, status: session.status }, 200)
  })

  // Satu endpoint untuk semua state yang dipakai dashboard (menggantikan
  // polling terpisah ke /sessions/:id, /status, /qr, dan /broadcast/current).
  router.openapi(sessionLiveRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    const [broadcast, pairingCode] = await Promise.all([
      broadcasts.current(session.id),
      redis.get(`wa:pairing:code:${session.id}`),
    ])
    const payload: SessionLiveDto = {
      session: toSessionDto(session),
      qr: session.lastQr,
      pairingCode,
      broadcast: broadcast ?? EMPTY_BROADCAST,
    }
    return c.json(payload, 200)
  })

  router.openapi(pairingCodeRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    const code = await redis.get(`wa:pairing:code:${session.id}`)
    const payload: PairingResponseDto = { code, status: session.status }
    return c.json(payload, 200)
  })

  router.openapi(requestPairingCodeRoute, async (c) => {
    requireAdmin(c)
    const sessionId = c.req.param('id')
    const input = c.req.valid('json')
    await sessions.setPhoneNumber(sessionId, input.phoneNumber)
    const session = await sessions.updateStatus(sessionId, 'connecting')
    await redis.set(`wa:pairing:request:${sessionId}`, input.phoneNumber, 'EX', 600)
    await publishSessionControl(redis, { sessionId, action: 'start' })
    const payload: PairingResponseDto = { code: null, status: session.status }
    return c.json(payload, 202)
  })

  return router
}
