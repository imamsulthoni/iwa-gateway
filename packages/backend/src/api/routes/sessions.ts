import {
  SESSION_STATUS_LABELS,
  createSessionSchema,
  pairingRequestSchema,
  type PairingResponseDto,
} from '@wa/shared'
import { Hono } from 'hono'
import type { Redis } from 'ioredis'

import type { SessionsService } from '../../modules/sessions/service.js'
import { toSessionDto } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'
import { errorResponse } from '../middleware/error.js'
import { parseOrThrow } from '../validation.js'

export function createSessionsRoute(sessions: SessionsService, redis: Redis) {
  const router = new Hono<AppBindings>()

  router.get('/', async (c) => {
    const rows = await sessions.list(50)
    return c.json({ items: rows.map(toSessionDto), nextCursor: null })
  })

  router.post('/', async (c) => {
    const input = parseOrThrow(createSessionSchema, await c.req.json().catch(() => null))
    if (input.mode === 'pairing' && !input.phoneNumber) {
      return errorResponse(c, 422, 'VALIDATION_ERROR', 'Mode pairing wajib menyertakan phoneNumber')
    }
    const { session, token } = await sessions.create(input)
    return c.json({ token, session: toSessionDto(session) }, 201)
  })

  router.get('/:id', async (c) => c.json(toSessionDto(await sessions.get(c.req.param('id')))))

  router.delete('/:id', async (c) => {
    await sessions.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  router.post('/:id/login', async (c) => {
    const session = await sessions.updateStatus(c.req.param('id'), 'connecting')
    return c.json(toSessionDto(session))
  })

  router.post('/:id/logout', async (c) => {
    const session = await sessions.updateStatus(c.req.param('id'), 'logged_out')
    return c.json(toSessionDto(session))
  })

  router.post('/:id/token/rotate', async (c) => {
    const { session, token } = await sessions.rotateToken(c.req.param('id'))
    return c.json({ token, session: toSessionDto(session) })
  })

  router.get('/:id/status', async (c) => {
    const session = await sessions.get(c.req.param('id'))
    return c.json({
      status: session.status,
      statusLabel: SESSION_STATUS_LABELS[session.status],
      phoneNumber: session.phoneNumber,
      salesId: session.salesId,
      agentId: session.agentId,
    })
  })

  router.get('/:id/qr', async (c) => {
    const session = await sessions.get(c.req.param('id'))
    return c.json({ qr: session.lastQr, status: session.status })
  })

  router.get('/:id/pairing', async (c) => {
    const session = await sessions.get(c.req.param('id'))
    const code = await redis.get(`wa:pairing:code:${session.id}`)
    const payload: PairingResponseDto = { code, status: session.status }
    return c.json(payload)
  })

  router.post('/:id/pairing', async (c) => {
    const sessionId = c.req.param('id')
    const input = parseOrThrow(pairingRequestSchema, await c.req.json().catch(() => null))
    await sessions.setPhoneNumber(sessionId, input.phoneNumber)
    const session = await sessions.updateStatus(sessionId, 'connecting')
    await redis.set(`wa:pairing:request:${sessionId}`, input.phoneNumber, 'EX', 600)
    const payload: PairingResponseDto = { code: null, status: session.status }
    return c.json(payload, 202)
  })

  return router
}
