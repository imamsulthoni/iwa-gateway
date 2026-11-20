import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  apiErrorBody,
  crossSessionMessageQuerySchema,
  messageListSchema,
  messageQuerySchema,
  retryMessageResponseSchema,
  sendMessageResponseSchema,
  sendMessageSchema,
  sendMessageV1Schema,
} from '@wa/shared'
import type { MiddlewareHandler } from 'hono'

import type { ApiKeyAuthenticator } from '../../modules/auth/api-key.js'
import type { AuthService } from '../../modules/auth/service.js'
import type { ConversationsService } from '../../modules/conversations/service.js'
import { toUserJid } from '../../modules/messages/phone.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { QueueRegistry } from '../../infra/queue.js'
import { enqueue, SEND_JOB_OPTIONS } from '../../infra/queue.js'
import type { AppBindings } from '../app.js'
import { apiKeyOrSessionTokenMiddleware, ensureSessionAccess } from '../middleware/auth.js'
import { idParamSchema, openApiError } from '../openapi.js'

const sessionMessageSecurity: Record<string, string[]>[] = [
  { ApiKey: [] },
  { SessionToken: [] },
  { UserToken: [] },
]
const adminOrSalesSecurity: Record<string, string[]>[] = [{ ApiKey: [] }, { UserToken: [] }]

const sendMessageRoute = createRoute({
  method: 'post',
  path: '/{id}/messages',
  tags: ['Messages (sesi)'],
  summary: 'Kirim pesan dari sebuah sesi',
  security: sessionMessageSecurity,
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: sendMessageSchema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Pesan masuk antrean pengiriman',
      content: { 'application/json': { schema: sendMessageResponseSchema } },
    },
    200: {
      description: 'Pesan duplikat (clientRef sudah pernah dikirim)',
      content: { 'application/json': { schema: sendMessageResponseSchema } },
    },
    401: openApiError('API key / token sesi tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Data pesan tidak valid atau sesi belum terhubung'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const sendMessageV1Route = createRoute({
  method: 'post',
  path: '/messages',
  tags: ['Messages'],
  summary: 'Kirim pesan teks lintas sesi',
  security: adminOrSalesSecurity,
  request: {
    body: {
      content: { 'application/json': { schema: sendMessageV1Schema } },
      required: true,
    },
  },
  responses: {
    202: {
      description: 'Pesan masuk antrean pengiriman',
      content: { 'application/json': { schema: sendMessageResponseSchema } },
    },
    200: {
      description: 'Pesan duplikat (clientRef sudah pernah dikirim)',
      content: { 'application/json': { schema: sendMessageResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Data pesan tidak valid atau sesi belum terhubung'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const listSessionMessagesRoute = createRoute({
  method: 'get',
  path: '/{id}/messages',
  tags: ['Messages (sesi)'],
  summary: 'Riwayat pesan sebuah sesi',
  security: sessionMessageSecurity,
  request: { params: idParamSchema, query: messageQuerySchema },
  responses: {
    200: {
      description: 'Halaman riwayat pesan sesi',
      content: { 'application/json': { schema: messageListSchema } },
    },
    401: openApiError('API key / token sesi tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const listMessagesRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['Messages'],
  summary: 'Riwayat pesan lintas sesi',
  security: [{ ApiKey: [] }],
  request: { query: crossSessionMessageQuerySchema },
  responses: {
    200: {
      description: 'Halaman riwayat pesan',
      content: { 'application/json': { schema: messageListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const deleteMessageRoute = createRoute({
  method: 'delete',
  path: '/{id}',
  tags: ['Messages'],
  summary: 'Soft delete satu pesan',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Pesan dihapus' },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Pesan tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const retryMessageRoute = createRoute({
  method: 'post',
  path: '/{id}/retry',
  tags: ['Messages'],
  summary: 'Kirim ulang pesan yang gagal',
  security: [{ ApiKey: [] }],
  request: { params: idParamSchema },
  responses: {
    202: {
      description: 'Pesan masuk antrean pengiriman ulang',
      content: { 'application/json': { schema: retryMessageResponseSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Pesan tidak ditemukan'),
    409: openApiError('Status pesan berubah saat diproses'),
    422: openApiError('Pesan tidak berstatus gagal'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createSessionMessagesRoute(
  sessions: SessionsService,
  messages: MessagesService,
  queues: QueueRegistry,
  auth: ApiKeyAuthenticator,
  userAuth: AuthService,
  rateLimit: MiddlewareHandler<AppBindings>,
) {
  const router = new OpenAPIHono<AppBindings>()

  router.use(
    '/:id/messages',
    apiKeyOrSessionTokenMiddleware({ apiKey: auth, auth: userAuth, sessions }),
    rateLimit,
  )

  router.openapi(sendMessageRoute, async (c) => {
    const sessionId = c.req.param('id')
    const input = c.req.valid('json')
    const session = c.get('session') ?? (await sessions.get(sessionId))
    if (c.get('actor')) ensureSessionAccess(c, session)

    // Sesi yang belum terhubung tidak boleh menerima pesan baru. Replay
    // idempoten (clientRef sama) tetap mengembalikan pesan lama.
    if (session.status !== 'connected') {
      const existing = await messages.findByClientRef(sessionId, input.clientRef)
      if (!existing) {
        return c.json(
          apiErrorBody(
            'VALIDATION_ERROR',
            'Sesi belum terhubung. Tunggu status connected lalu kirim ulang.',
          ),
          422,
        )
      }
      return c.json({ message: existing, duplicate: true }, 200)
    }

    const result = await messages.createOutgoing({ sessionId, ...input })

    if (!result.duplicate) {
      await enqueue(
        queues.send,
        'send-message',
        { sessionId, messageId: result.message.id },
        result.message.id,
        0,
        SEND_JOB_OPTIONS,
      )
    }

    return c.json(result, result.duplicate ? 200 : 202)
  })

  router.openapi(listSessionMessagesRoute, async (c) => {
    const query = c.req.valid('query')
    const sessionId = c.req.param('id')
    const session = c.get('session') ?? (await sessions.get(sessionId))
    if (c.get('actor')) ensureSessionAccess(c, session)
    const page = await messages.listBySession(sessionId, query.limit, query.cursor, query.direction)
    return c.json(page, 200)
  })

  return router
}

export function createV1MessagesRoute(
  messages: MessagesService,
  conversations: ConversationsService,
  sessions: SessionsService,
  queues: QueueRegistry,
) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(sendMessageV1Route, async (c) => {
    const input = c.req.valid('json')
    const session = await sessions.get(input.sessionId)
    ensureSessionAccess(c, session)

    if (session.status !== 'connected') {
      const existing = await messages.findByClientRef(session.id, input.clientRef)
      if (!existing) {
        return c.json(
          apiErrorBody(
            'VALIDATION_ERROR',
            'Sesi belum terhubung. Tunggu status connected lalu kirim ulang.',
          ),
          422,
        )
      }
      return c.json({ message: existing, duplicate: true }, 200)
    }

    const conversation = await conversations.findBySessionAndAddress(
      session.id,
      toUserJid(input.to),
    )
    const { sessionId: _sessionId, ...body } = input
    const result = await messages.createOutgoing({
      ...body,
      sessionId: session.id,
      conversationId: conversation?.id,
    })

    if (!result.duplicate) {
      await enqueue(
        queues.send,
        'send-message',
        { sessionId: session.id, messageId: result.message.id },
        result.message.id,
        0,
        SEND_JOB_OPTIONS,
      )
    }

    return c.json(result, result.duplicate ? 200 : 202)
  })

  return router
}

export function createMessagesRoute(messages: MessagesService, queues: QueueRegistry) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(listMessagesRoute, async (c) => {
    const query = c.req.valid('query')
    const page = await messages.listAll(query.limit, query.sessionId, undefined, query.direction)
    return c.json(page, 200)
  })

  router.openapi(retryMessageRoute, async (c) => {
    const message = await messages.retry(c.req.param('id'))
    // Job id unik agar pesan yang sama bisa diantrekan ulang setelah gagal.
    await enqueue(
      queues.send,
      'send-message',
      { sessionId: message.sessionId, messageId: message.id },
      `${message.id}-retry-${Date.now()}`,
      0,
      SEND_JOB_OPTIONS,
    )
    return c.json({ message }, 202)
  })

  router.openapi(deleteMessageRoute, async (c) => {
    await messages.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  return router
}
