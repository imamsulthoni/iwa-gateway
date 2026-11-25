import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  SESSION_STATUS_LABELS,
  apiErrorBody,
  attachSalesSchema,
  createSessionSchema,
  pairingRequestSchema,
  pairingResponseSchema,
  qrResponseSchema,
  resetSalesPinSchema,
  sessionListSchema,
  sessionLiveSchema,
  sessionSchema,
  sessionStatusSchema,
  sessionTokenSchema,
  type BroadcastCurrentDto,
  type SessionLiveDto,
  type PairingResponseDto,
} from '@wbc/shared'
import type { Redis } from 'ioredis'

import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import { toSessionDto } from '../../modules/sessions/service.js'
import type { SettingsService } from '../../modules/settings/service.js'
import { publishSessionControl } from '../../infra/session-control.js'
import type { AppBindings } from '../app.js'
import { ensureSessionAccess, requireAdmin } from '../middleware/auth.js'
import { sessionIdParamSchema, openApiError } from '../openapi.js'

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
    409: openApiError('publicId/nomor sudah dipakai, atau batas jumlah sales tercapai'),
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  security: anyAuthSecurity,
  request: { params: sessionIdParamSchema },
  responses: {
    200: {
      description: 'Sesi masuk status connecting',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key atau token login tidak valid'),
    403: openApiError('Akses ke sesi ini ditolak'),
    404: openApiError('Sesi tidak ditemukan'),
    409: openApiError('Sesi sudah terhubung; logout dulu untuk pairing ulang'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const cancelSessionRoute = createRoute({
  method: 'post',
  path: '/{id}/cancel',
  tags: ['Sessions'],
  summary: 'Batalkan proses pairing',
  security: anyAuthSecurity,
  request: { params: sessionIdParamSchema },
  responses: {
    200: {
      description: 'Sesi diputus dan QR dikosongkan',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key atau token login tidak valid'),
    403: openApiError('Akses ke sesi ini ditolak'),
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  request: { params: sessionIdParamSchema },
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
  summary: 'Pairing dengan kode dinonaktifkan (pakai QR)',
  security: anyAuthSecurity,
  request: {
    params: sessionIdParamSchema,
    body: {
      content: { 'application/json': { schema: pairingRequestSchema } },
      required: true,
    },
  },
  responses: {
    401: openApiError('API key atau token login tidak valid'),
    409: openApiError('Pairing dengan kode dinonaktifkan; gunakan QR'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const resetSalesPinRoute = createRoute({
  method: 'post',
  path: '/{id}/sales/pin',
  tags: ['Sessions'],
  summary: 'Reset PIN akun sales sesi',
  security: apiKeySecurity,
  request: {
    params: sessionIdParamSchema,
    body: {
      content: { 'application/json': { schema: resetSalesPinSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'PIN diperbarui dan token login sales lama dicabut',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    403: openApiError('Akses khusus admin'),
    404: openApiError('Sesi tidak ditemukan'),
    409: openApiError('Sesi ini belum memiliki akun sales'),
    422: openApiError('PIN tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const attachSalesRoute = createRoute({
  method: 'patch',
  path: '/{id}/sales',
  tags: ['Sessions'],
  summary: 'Tautkan akun sales ke sesi lama',
  security: apiKeySecurity,
  request: {
    params: sessionIdParamSchema,
    body: {
      content: { 'application/json': { schema: attachSalesSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Akun sales tertaut ke sesi',
      content: { 'application/json': { schema: sessionSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    403: openApiError('Akses khusus admin'),
    404: openApiError('Sesi tidak ditemukan'),
    409: openApiError('Sesi sudah memiliki sales, nomor sudah dipakai, atau kuota penuh'),
    422: openApiError('Data sales tidak valid atau sesi belum memiliki nomor'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createSessionsRoute(
  sessions: SessionsService,
  broadcasts: BroadcastsService,
  redis: Redis,
  settings: SettingsService,
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
    const current = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, current)
    // Sesi terhubung punya socket hidup; perintah start akan diabaikan worker
    // dan status bisa tertinggal `connecting`, memblokir pengiriman pesan.
    if (current.status === 'connected') {
      return c.json(
        apiErrorBody('CONFLICT', 'Sesi sudah terhubung. Logout sesi dulu untuk pairing ulang.'),
        409,
      )
    }
    const session = await sessions.updateStatus(current.id, 'connecting')
    await publishSessionControl(redis, { sessionId: session.id, action: 'start' })
    return c.json(toSessionDto(session), 200)
  })

  router.openapi(cancelSessionRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
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
    const [broadcast, pairingCode, reason, config] = await Promise.all([
      broadcasts.current(session.id),
      redis.get(`wa:pairing:code:${session.id}`),
      redis.get(`wa:session:reason:${session.id}`),
      settings.getSettings(),
    ])
    const payload: SessionLiveDto = {
      session: toSessionDto(session),
      qr: session.lastQr,
      pairingCode,
      reason,
      broadcast: broadcast ?? EMPTY_BROADCAST,
      defaultDelay: { min: config.defaultMinDelay, max: config.defaultMaxDelay },
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
    // Pairing dengan kode dinonaktifkan sementara: hanya QR yang didukung.
    return c.json(apiErrorBody('CONFLICT', 'Pairing dengan kode dinonaktifkan. Gunakan QR.'), 409)
  })

  router.openapi(resetSalesPinRoute, async (c) => {
    requireAdmin(c)
    const session = await sessions.resetSalesPin(c.req.param('id'), c.req.valid('json').pin)
    return c.json(toSessionDto(session), 200)
  })

  router.openapi(attachSalesRoute, async (c) => {
    requireAdmin(c)
    const session = await sessions.attachSales(c.req.param('id'), c.req.valid('json'))
    return c.json(toSessionDto(session), 200)
  })

  return router
}
