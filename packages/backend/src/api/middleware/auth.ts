import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wbc/shared'

import type { ApiKeyAuthenticator } from '../../modules/auth/api-key.js'
import type { AuthService, AuthUser } from '../../modules/auth/service.js'
import { verifySessionToken } from '../../modules/auth/session-token.js'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../modules/errors.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { AppBindings } from '../app.js'

export type Actor =
  | { mode: 'admin'; apiKeyId: string }
  | { mode: 'sales'; user: AuthUser }

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

/** Menerima API key (admin) atau token login sales. */
export function anyAuthMiddleware(deps: { apiKey: ApiKeyAuthenticator; auth: AuthService }) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const apiKey = c.req.header('x-api-key')
    if (apiKey) {
      const record = await deps.apiKey.findActive(apiKey)
      if (!record) {
        return c.json(apiErrorBody('UNAUTHORIZED', 'API key tidak valid'), 401)
      }
      c.set('apiKeyId', record.id)
      c.set('actor', { mode: 'admin', apiKeyId: record.id })
      await next()
      return
    }

    const token = bearerToken(c.req.header('authorization'))
    if (!token) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key atau token login wajib dikirim'), 401)
    }
    const user = await deps.auth.authenticate(token)
    if (!user) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'Token login tidak valid'), 401)
    }
    c.set('actor', { mode: 'sales', user })
    await next()
  })
}

/**
 * Endpoint per sesi: API key, Bearer token sesi, atau Bearer token login sales.
 * Handler wajib memanggil `ensureSessionAccess` saat actor adalah sales.
 */
export function apiKeyOrSessionTokenMiddleware(deps: {
  apiKey: ApiKeyAuthenticator
  auth: AuthService
  sessions: SessionsService
}) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const apiKey = c.req.header('x-api-key')
    if (apiKey) {
      const record = await deps.apiKey.findActive(apiKey)
      if (!record) {
        return c.json(apiErrorBody('UNAUTHORIZED', 'API key tidak valid'), 401)
      }
      c.set('apiKeyId', record.id)
      c.set('actor', { mode: 'admin', apiKeyId: record.id })
      await next()
      return
    }

    const token = bearerToken(c.req.header('authorization'))
    if (!token) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key atau token wajib dikirim'), 401)
    }
    const sessionId = c.req.param('id')
    if (!sessionId) {
      return c.json(apiErrorBody('VALIDATION_ERROR', 'ID sesi wajib diisi'), 422)
    }
    try {
      const session = await deps.sessions.get(sessionId)
      if (session.tokenHash && verifySessionToken(token, session.tokenHash)) {
        c.set('session', session)
        await next()
        return
      }
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json(apiErrorBody('NOT_FOUND', error.message), 404)
      }
      throw error
    }

    const user = await deps.auth.authenticate(token)
    if (!user) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'Token tidak valid'), 401)
    }
    c.set('actor', { mode: 'sales', user })
    await next()
  })
}

export function requireAdminMiddleware() {
  return createMiddleware<AppBindings>(async (c, next) => {
    const actor = c.get('actor')
    if (!actor) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'Autentikasi wajib dikirim'), 401)
    }
    if (actor.mode !== 'admin') {
      return c.json(apiErrorBody('FORBIDDEN', 'Akses khusus admin'), 403)
    }
    await next()
  })
}

export function requireAdmin(c: Context<AppBindings>): void {
  const actor = c.get('actor')
  if (!actor) throw new UnauthorizedError('Autentikasi wajib dikirim')
  if (actor.mode !== 'admin') throw new ForbiddenError('Akses khusus admin')
}

export function ensureSessionAccess(
  c: Context<AppBindings>,
  session: { ownerUserId: string | null },
): void {
  const actor = c.get('actor')
  if (!actor) throw new UnauthorizedError('Autentikasi wajib dikirim')
  if (actor.mode === 'admin') return
  if (session.ownerUserId !== null && session.ownerUserId === actor.user.id) return
  throw new ForbiddenError('Akses ke sesi ini ditolak')
}
