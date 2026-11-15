import { createBroadcastSchema } from '@wa/shared'
import { Hono } from 'hono'

import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue } from '../../infra/queue.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { AppBindings } from '../app.js'
import { parseOrThrow } from '../validation.js'

export function createBroadcastsRoute(broadcasts: BroadcastsService, queues: QueueRegistry) {
  const router = new Hono<AppBindings>()

  router.post('/:id/broadcast', async (c) => {
    const sessionId = c.req.param('id')
    const input = parseOrThrow(createBroadcastSchema, await c.req.json().catch(() => null))
    const { broadcast } = await broadcasts.create(sessionId, input)
    await enqueue(
      queues.broadcast,
      'broadcast-run',
      { sessionId, broadcastId: broadcast.id },
      broadcast.id,
    )
    return c.json({ broadcastId: broadcast.id, jobId: broadcast.id, status: broadcast.status }, 202)
  })

  router.get('/:id/broadcast/current', async (c) => {
    const current = await broadcasts.current(c.req.param('id'))
    if (!current) {
      return c.json({
        jobId: null,
        status: null,
        total: 0,
        done: 0,
        sent: 0,
        failed: 0,
        recipients: [],
      })
    }
    return c.json(current)
  })

  router.post('/:id/broadcast/cancel', async (c) => {
    const broadcast = await broadcasts.cancel(c.req.param('id'))
    return c.json({ broadcastId: broadcast.id, status: broadcast.status })
  })

  return router
}
