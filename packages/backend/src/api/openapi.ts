import { OpenAPIHono, type Hook } from '@hono/zod-openapi'
import { apiErrorSchema } from '@wa/shared'
import { z } from 'zod'

import { ValidationError } from '../modules/errors.js'
import type { AppBindings } from './app.js'
import { APP_NAME, APP_VERSION } from './version.js'

export const openApiDocumentConfig = {
  openapi: '3.1.0',
  info: {
    title: `${APP_NAME} API`,
    version: APP_VERSION,
    description:
      'API gateway WhatsApp. Endpoint /sessions, /messages, dan /stats memakai header `x-api-key`; endpoint pesan per sesi menerima `x-api-key` atau Bearer token sesi.',
  },
} as const

export const idParamSchema = z.object({
  id: z.string().min(1).describe('ID resource'),
})

export function openApiError(description: string) {
  return {
    description,
    content: { 'application/json': { schema: apiErrorSchema } },
  }
}

const validationHook: Hook<unknown, AppBindings, string, void> = (result) => {
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'Data tidak valid')
  }
}

export function createOpenApiApp() {
  const app = new OpenAPIHono<AppBindings>({ defaultHook: validationHook })

  app.openAPIRegistry.registerComponent('securitySchemes', 'ApiKey', {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
    description: 'API key aktif dari tabel api_keys.',
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'SessionToken', {
    type: 'http',
    scheme: 'bearer',
    description: 'Bearer token sesi dari endpoint pembuatan/rotasi token sesi.',
  })

  return app
}