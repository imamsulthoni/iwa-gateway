import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import type { Context } from 'hono'
import {
  apiErrorBody,
  authMeSchema,
  loginResponseSchema,
  loginSchema,
  type AuthMeDto,
} from '@wbc/shared'

import type { ApiKeyAuthenticator } from '../../modules/auth/api-key.js'
import type { AuthService, AuthUser } from '../../modules/auth/service.js'
import type { AppBindings } from '../app.js'
import { openApiError } from '../openapi.js'

const anyAuthSecurity: Record<string, string[]>[] = [{ ApiKey: [] }, { UserToken: [] }]

const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['Auth'],
  summary: 'Login sales dengan nomor WhatsApp dan PIN',
  request: {
    body: {
      content: { 'application/json': { schema: loginSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Token login sales berlaku 7 hari',
      content: { 'application/json': { schema: loginResponseSchema } },
    },
    401: openApiError('Nomor atau PIN salah'),
    403: openApiError('Nomor belum memiliki sesi WhatsApp'),
    409: openApiError('Batas jumlah sales tercapai'),
    422: openApiError('Data login tidak valid'),
    429: openApiError('Terlalu banyak percobaan login'),
    500: openApiError('Kesalahan internal'),
  },
})

const meRoute = createRoute({
  method: 'get',
  path: '/me',
  tags: ['Auth'],
  summary: 'Identitas aktor yang sedang login',
  security: anyAuthSecurity,
  responses: {
    200: {
      description: 'Mode admin (API key) atau sales beserta user',
      content: { 'application/json': { schema: authMeSchema } },
    },
    401: openApiError('API key atau token login tidak valid'),
    403: openApiError('Akses ditolak'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const logoutRoute = createRoute({
  method: 'post',
  path: '/logout',
  tags: ['Auth'],
  summary: 'Cabut token login sales',
  security: anyAuthSecurity,
  responses: {
    204: { description: 'Token dicabut (idempoten)' },
    401: openApiError('API key atau token login tidak valid'),
    403: openApiError('Akses ditolak'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

type Actor = { mode: 'admin' } | { mode: 'sales'; user: AuthUser }

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

async function resolveActor(
  c: Context<AppBindings>,
  apiKey: ApiKeyAuthenticator,
  auth: AuthService,
): Promise<Actor | null> {
  const key = c.req.header('x-api-key')
  if (key) {
    const record = await apiKey.findActive(key)
    return record ? { mode: 'admin' } : null
  }

  const token = bearerToken(c.req.header('authorization'))
  if (!token) return null
  const user = await auth.authenticate(token)
  return user ? { mode: 'sales', user } : null
}

export function createAuthRoute(deps: { apiKey: ApiKeyAuthenticator; auth: AuthService }) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(loginRoute, async (c) => {
    const input = c.req.valid('json')
    const { token, expiresAt, user } = await deps.auth.login(input.phoneNumber, input.pin)
    return c.json({ token, expiresAt: expiresAt.toISOString(), user }, 200)
  })

  router.openapi(meRoute, async (c) => {
    const actor = await resolveActor(c, deps.apiKey, deps.auth)
    if (!actor) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key atau token login wajib dikirim'), 401)
    }
    const body: AuthMeDto =
      actor.mode === 'admin' ? { mode: 'admin', user: null } : { mode: 'sales', user: actor.user }
    return c.json(body, 200)
  })

  router.openapi(logoutRoute, async (c) => {
    const actor = await resolveActor(c, deps.apiKey, deps.auth)
    if (!actor) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key atau token login wajib dikirim'), 401)
    }
    if (actor.mode === 'sales') {
      const token = bearerToken(c.req.header('authorization'))
      if (token) await deps.auth.logout(token)
    }
    return c.body(null, 204)
  })

  return router
}