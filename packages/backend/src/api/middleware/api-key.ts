import { createMiddleware } from 'hono/factory'
import { apiErrorBody } from '@wa/shared'

import type { ApiKeyAuthenticator } from '../../modules/auth/api-key.js'
import type { AppBindings } from '../app.js'

export function apiKeyMiddleware(auth: ApiKeyAuthenticator) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const apiKey = c.req.header('x-api-key')
    if (!apiKey) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key wajib dikirim'), 401)
    }
    const record = await auth.findActive(apiKey)
    if (!record) {
      return c.json(apiErrorBody('UNAUTHORIZED', 'API key tidak valid'), 401)
    }
    c.set('apiKeyId', record.id)
    await next()
  })
}
