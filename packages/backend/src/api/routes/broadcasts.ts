import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  broadcastCancelResponseSchema,
  broadcastCurrentSchema,
  createBroadcastResponseSchema,
  createBroadcastSchema,
} from '@wa/shared'

import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue } from '../../infra/queue.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { AppBindings } from '../app.js'
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
    const sessionId = c.req.param('id')
    const input = c.req.valid('json')
    const { broadcast } = await broadcasts.create(sessionId, input)
    await enqueue(
      queues.broadcast,
      'broadcast-run',
      { sessionId, broadcastId: broadcast.id },
      broadcast.id,
    )
    return c.json(
      { broadcastId: broadcast.id, jobId: broadcast.id, status: broadcast.status },
      202,
    )
  })

  router.openapi(currentBroadcastRoute, async (c) => {
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
          recipients: [],
        },
        200,
      )
    }
    return c.json(current, 200)
  })

  router.openapi(cancelBroadcastRoute, async (c) => {
    const broadcast = await broadcasts.cancel(c.req.param('id'))
    return c.json({ broadcastId: broadcast.id, status: broadcast.status }, 200)
  })

  return router
}