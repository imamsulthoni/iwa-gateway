import { OpenAPIHono } from '@hono/zod-openapi'
import type { Redis } from 'ioredis'
import { streamSSE } from 'hono/streaming'

import type { AppLogger } from '../../infra/logger.js'
import { trackSseConnection } from '../../infra/metrics.js'
import { subscribeSessionEvents } from '../../infra/pubsub.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'
import { ensureSessionAccess } from '../middleware/auth.js'
import { idParamSchema, openApiError } from '../openapi.js'

const HEARTBEAT_MS = 15_000

export function createEventsRoute(sessions: SessionsService, redis: Redis, logger: AppLogger) {
  const router = new OpenAPIHono<AppBindings>()

  // Handler SSE mengembalikan stream, jadi path didaftarkan manual agar tetap
  // muncul di dokumen OpenAPI yang dipakai katalog endpoint consumer.
  router.openAPIRegistry.registerPath({
    method: 'get',
    path: '/sessions/{id}/events',
    tags: ['Events'],
    summary: 'Stream event realtime sebuah sesi (SSE)',
    description:
      'Dibaca dengan fetch streaming + header x-api-key (bukan EventSource). Heartbeat dikirim setiap 15 detik.',
    security: [{ ApiKey: [] }, { UserToken: [] }],
    request: { params: idParamSchema },
    responses: {
      200: {
        description:
          'Stream text/event-stream berisi session.status, message.received, message.status',
        content: { 'text/event-stream': { schema: { type: 'string' } } },
      },
      401: openApiError('API key tidak dikirim atau tidak valid'),
      404: openApiError('Sesi tidak ditemukan'),
      429: openApiError('Rate limit terlampaui'),
    },
  })

  router.get('/sessions/:id/events', async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)

    return streamSSE(c, async (stream) => {
      const closeTracking = trackSseConnection()
      const unsubscribe = subscribeSessionEvents(redis, session.id, (event) => {
        void stream.writeSSE({
          id: event.id,
          event: event.event,
          data: JSON.stringify(event.data),
        })
      })

      const done = new Promise<void>((resolve) => {
        stream.onAbort(() => resolve())
      })

      const heartbeat = setInterval(() => {
        void (async () => {
          try {
            await sessions.get(session.id)
            await stream.write(': ping\n\n')
          } catch {
            stream.abort()
          }
        })()
      }, HEARTBEAT_MS)
      heartbeat.unref()

      try {
        await done
      } finally {
        clearInterval(heartbeat)
        await unsubscribe()
        closeTracking()
        logger.info({ sessionId: session.id }, 'Koneksi SSE ditutup')
      }
    })
  })

  return router
}
