import { OpenAPIHono } from '@hono/zod-openapi'
import type { Redis } from 'ioredis'
import { streamSSE } from 'hono/streaming'

import type { AppLogger } from '../../infra/logger.js'
import { trackSseConnection } from '../../infra/metrics.js'
import { subscribeSessionEvents } from '../../infra/pubsub.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'

const HEARTBEAT_MS = 15_000

export function createEventsRoute(sessions: SessionsService, redis: Redis, logger: AppLogger) {
  const router = new OpenAPIHono<AppBindings>()

  router.get('/sessions/:id/events', async (c) => {
    const session = await sessions.getByPublicId(c.req.param('id'))

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
