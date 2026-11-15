import { crossSessionMessageQuerySchema, messageQuerySchema, sendMessageSchema } from '@wa/shared'
import { Hono } from 'hono'

import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue } from '../../infra/queue.js'
import type { AppBindings } from '../app.js'
import { sessionTokenMiddleware } from '../middleware/session-token.js'
import { parseOrThrow } from '../validation.js'

export function createSessionMessagesRoute(
  sessions: SessionsService,
  messages: MessagesService,
  queues: QueueRegistry,
) {
  const router = new Hono<AppBindings>()
  const requireToken = sessionTokenMiddleware(sessions)

  router.post('/:id/messages', requireToken, async (c) => {
    const sessionId = c.req.param('id')
    const input = parseOrThrow(sendMessageSchema, await c.req.json().catch(() => null))
    const result = await messages.createOutgoing({ sessionId, ...input })

    if (!result.duplicate) {
      await enqueue(
        queues.send,
        'send-message',
        { sessionId, messageId: result.message.id },
        result.message.id,
      )
    }

    return c.json(result, result.duplicate ? 200 : 202)
  })

  router.get('/:id/messages', requireToken, async (c) => {
    const query = parseOrThrow(messageQuerySchema, c.req.query())
    const page = await messages.listBySession(c.req.param('id'), query.limit, query.cursor)
    return c.json(page)
  })

  return router
}

export function createMessagesRoute(messages: MessagesService) {
  const router = new Hono<AppBindings>()

  router.get('/', async (c) => {
    const query = parseOrThrow(crossSessionMessageQuerySchema, c.req.query())
    const page = await messages.listAll(query.limit, query.sessionId)
    return c.json(page)
  })

  router.delete('/:id', async (c) => {
    await messages.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  return router
}
