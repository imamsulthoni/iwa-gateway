import {
  crossSessionMessageQuerySchema,
  messageQuerySchema,
  sendMessageSchema,
} from '@wa/shared'
import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wa/shared'

import type { ApiKeyAuthenticator } from '../../modules/auth/api-key.js'
import { verifySessionToken } from '../../modules/auth/session-token.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue } from '../../infra/queue.js'
import type { AppBindings } from '../app.js'
import { parseOrThrow } from '../validation.js'

function anyAuthMiddleware(auth: ApiKeyAuthenticator, sessions: SessionsService) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const apiKey = c.req.header('x-api-key')
    if (apiKey) {
      const record = await auth.findActive(apiKey)
      if (!record) {
        return c.json(apiErrorBody('UNAUTHORIZED', 'API key tidak valid'), 401)
      }
      c.set('apiKeyId', record.id)
      await next()
      return
    }

    const header = c.req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
    if (!token) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key atau token sesi wajib dikirim'), 401)
    }
    const sessionId = c.req.param('id')
    if (!sessionId) {
      return c.json(apiErrorBody('VALIDATION_ERROR', 'ID sesi wajib diisi'), 422)
    }
    try {
      const session = await sessions.get(sessionId)
      if (!session.tokenHash || !verifySessionToken(token, session.tokenHash)) {
        return c.json(apiErrorBody('UNAUTHORIZED', 'Token sesi tidak valid'), 401)
      }
      c.set('session', session)
    } catch (error) {
      void error
      return c.json(apiErrorBody('NOT_FOUND', 'Sesi tidak ditemukan'), 404)
    }
    await next()
  })
}

export function createSessionMessagesRoute(
  sessions: SessionsService,
  messages: MessagesService,
  queues: QueueRegistry,
  auth: ApiKeyAuthenticator,
  rateLimit: MiddlewareHandler<AppBindings>,
) {
  const router = new Hono<AppBindings>()
  const requireAuth = anyAuthMiddleware(auth, sessions)

  router.post('/:id/messages', requireAuth, rateLimit, async (c) => {
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

  router.get('/:id/messages', requireAuth, rateLimit, async (c) => {
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
