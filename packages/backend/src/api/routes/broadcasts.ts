import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  broadcastCancelResponseSchema,
  broadcastCurrentSchema,
  broadcastV1ResponseSchema,
  broadcastV1Schema,
  createBroadcastResponseSchema,
  createBroadcastSchema,
} from '@wa/shared'

import { newId } from '../../db/id.js'
import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue } from '../../infra/queue.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import { ValidationError } from '../../modules/errors.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'
import { requireAdmin } from '../middleware/auth.js'
import { idParamSchema, openApiError } from '../openapi.js'

const startBroadcastRoute = createRoute({
  method: 'post',
  path: '/{id}/broadcast',
  tags: ['Sessions'],
  summary: 'Mulai broadcast untuk sesi',
  security: [{ ApiKey: [] }],
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: createBroadcastSchema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Broadcast masuk antrean',
      content: { 'application/json': { schema: createBroadcastResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Data broadcast tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const currentBroadcastRoute = createRoute({
  method: 'get',
  path: '/{id}/broadcast/current',
  tags: ['Sessions'],
  summary: 'Broadcast yang sedang berjalan pada sesi',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Broadcast aktif; field bernilai kosong bila tidak ada broadcast',
      content: { 'application/json': { schema: broadcastCurrentSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const cancelBroadcastRoute = createRoute({
  method: 'post',
  path: '/{id}/broadcast/cancel',
  tags: ['Sessions'],
  summary: 'Batalkan broadcast aktif',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Broadcast dibatalkan',
      content: { 'application/json': { schema: broadcastCancelResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Broadcast tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createBroadcastsRoute(broadcasts: BroadcastsService, queues: QueueRegistry) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(startBroadcastRoute, async (c) => {
    requireAdmin(c)
    const sessionId = c.req.param('id')
    const input = c.req.valid('json')
    const { broadcast, duplicate } = await broadcasts.create(sessionId, input)
    if (!duplicate) {
      await enqueue(
        queues.broadcast,
        'broadcast-run',
        { sessionId, broadcastId: broadcast.id },
        broadcast.id,
      )
    }
    return c.json({ broadcastId: broadcast.id, jobId: broadcast.id, status: broadcast.status }, 202)
  })

  router.openapi(currentBroadcastRoute, async (c) => {
    requireAdmin(c)
    const current = await broadcasts.current(c.req.param('id'))
    if (!current) {
      return c.json(
        {
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
        },
        200,
      )
    }
    return c.json(current, 200)
  })

  router.openapi(cancelBroadcastRoute, async (c) => {
    requireAdmin(c)
    const broadcast = await broadcasts.cancel(c.req.param('id'))
    return c.json({ broadcastId: broadcast.id, status: broadcast.status }, 200)
  })

  return router
}

const createBroadcastV1Route = createRoute({
  method: 'post',
  path: '/broadcasts',
  tags: ['Broadcasts'],
  summary: 'Buat broadcast teks, opsional terjadwal',
  security: [{ ApiKey: [] }],
  request: {
    body: {
      content: { 'application/json': { schema: broadcastV1Schema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Broadcast masuk antrean',
      content: { 'application/json': { schema: createBroadcastResponseSchema } },
    },
    200: {
      description: 'Broadcast duplikat (clientRef sudah pernah dipakai di sesi ini)',
      content: { 'application/json': { schema: createBroadcastResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Data broadcast tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const getBroadcastV1Route = createRoute({
  method: 'get',
  path: '/broadcasts/{id}',
  tags: ['Broadcasts'],
  summary: 'Status dan progres broadcast',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Broadcast beserta ringkasan penerima',
      content: { 'application/json': { schema: broadcastV1ResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Broadcast tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const startBroadcastV1Route = createRoute({
  method: 'post',
  path: '/broadcasts/{id}/start',
  tags: ['Broadcasts'],
  summary: 'Mulai atau lanjutkan broadcast',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Broadcast masuk antrean',
      content: { 'application/json': { schema: broadcastCancelResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Broadcast tidak ditemukan'),
    422: openApiError('Broadcast tidak bisa dimulai pada status ini'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const pauseBroadcastV1Route = createRoute({
  method: 'post',
  path: '/broadcasts/{id}/pause',
  tags: ['Broadcasts'],
  summary: 'Jeda broadcast berjalan',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Broadcast dijeda; penerima tersisa tetap pending',
      content: { 'application/json': { schema: broadcastCancelResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Broadcast tidak ditemukan'),
    422: openApiError('Broadcast tidak bisa dijeda pada status ini'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createBroadcastsV1Route(
  broadcasts: BroadcastsService,
  sessions: SessionsService,
  queues: QueueRegistry,
) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(createBroadcastV1Route, async (c) => {
    const input = c.req.valid('json')
    const session = await sessions.getByPublicId(input.sessionId)
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      throw new ValidationError('Waktu jadwal harus di masa depan')
    }

    const { broadcast, duplicate } = await broadcasts.create(session.id, input, scheduledAt)
    if (!duplicate) {
      await enqueue(
        queues.broadcast,
        'broadcast-run',
        { sessionId: session.id, broadcastId: broadcast.id },
        broadcast.id,
        scheduledAt ? Math.max(scheduledAt.getTime() - Date.now(), 0) : 0,
      )
    }
    return c.json(
      { broadcastId: broadcast.id, jobId: broadcast.id, status: broadcast.status },
      duplicate ? 200 : 202,
    )
  })

  router.openapi(getBroadcastV1Route, async (c) => {
    return c.json(await broadcasts.detail(c.req.param('id')), 200)
  })

  router.openapi(startBroadcastV1Route, async (c) => {
    const broadcast = await broadcasts.start(c.req.param('id'))
    await enqueue(
      queues.broadcast,
      'broadcast-run',
      { sessionId: broadcast.sessionId, broadcastId: broadcast.id },
      `${broadcast.id}:${newId()}`,
    )
    return c.json({ broadcastId: broadcast.id, status: broadcast.status }, 200)
  })

  router.openapi(pauseBroadcastV1Route, async (c) => {
    const broadcast = await broadcasts.pause(c.req.param('id'))
    return c.json({ broadcastId: broadcast.id, status: broadcast.status }, 200)
  })

  return router
}
