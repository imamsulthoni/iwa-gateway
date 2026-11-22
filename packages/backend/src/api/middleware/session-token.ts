import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wbc/shared'

import { verifySessionToken } from '../../modules/auth/session-token.js'
import { NotFoundError } from '../../modules/errors.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'

export function sessionTokenMiddleware(sessions: SessionsService) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const header = c.req.header('authorization')
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null
    if (!token) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'Token sesi wajib dikirim'), 401)
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
      if (error instanceof NotFoundError) {
        return c.json(apiErrorBody('NOT_FOUND', error.message), 404)
      }
      throw error
    }

    await next()
  })
}
