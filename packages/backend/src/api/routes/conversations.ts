import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  conversationListSchema,
  conversationQuerySchema,
  conversationSchema,
  roomMessageListSchema,
  roomMessageQuerySchema,
} from '@wa/shared'

import type { ConversationsService } from '../../modules/conversations/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'
import { ensureSessionAccess } from '../middleware/auth.js'
import { idParamSchema, openApiError } from '../openapi.js'

const anyAuthSecurity: Record<string, string[]>[] = [{ ApiKey: [] }, { UserToken: [] }]

const listConversationsRoute = createRoute({
  method: 'get',
  path: '/sessions/{id}/conversations',
  tags: ['Conversations'],
  summary: 'Daftar room chat sebuah sesi',
  security: anyAuthSecurity,
  request: { params: idParamSchema, query: conversationQuerySchema },
  responses: {
    200: {
      description: 'Room chat urut dari pesan terbaru',
      content: { 'application/json': { schema: conversationListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Sesi tidak ditemukan'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const listRoomMessagesRoute = createRoute({
  method: 'get',
  path: '/conversations/{id}/messages',
  tags: ['Conversations'],
  summary: 'Riwayat pesan satu room',
  security: anyAuthSecurity,
  request: { params: idParamSchema, query: roomMessageQuerySchema },
  responses: {
    200: {
      description: 'Halaman pesan room chat',
      content: { 'application/json': { schema: roomMessageListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Percakapan tidak ditemukan'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const markConversationReadRoute = createRoute({
  method: 'post',
  path: '/conversations/{id}/read',
  tags: ['Conversations'],
  summary: 'Tandai room sudah dibaca',
  security: anyAuthSecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Unread count direset dan pesan masuk ditandai read',
      content: { 'application/json': { schema: conversationSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Percakapan tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createConversationsRoute(
  conversations: ConversationsService,
  sessions: SessionsService,
) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(listConversationsRoute, async (c) => {
    const session = await sessions.get(c.req.param('id'))
    ensureSessionAccess(c, session)
    const query = c.req.valid('query')
    const page = await conversations.listRooms(session.id, query.limit, query.cursor)
    return c.json(page, 200)
  })

  router.openapi(listRoomMessagesRoute, async (c) => {
    const conversation = await conversations.get(c.req.param('id'))
    ensureSessionAccess(c, await sessions.get(conversation.sessionId))
    const query = c.req.valid('query')
    const page = await conversations.listMessages(conversation.id, query.limit, query.cursor)
    return c.json(page, 200)
  })

  router.openapi(markConversationReadRoute, async (c) => {
    const conversation = await conversations.get(c.req.param('id'))
    ensureSessionAccess(c, await sessions.get(conversation.sessionId))
    const updated = await conversations.markRead(conversation.id)
    return c.json(updated, 200)
  })

  return router
}
