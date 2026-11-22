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
    description: [
      'API gateway WhatsApp. Endpoint Fase 1 (`/sessions`, `/messages`, `/stats`) dan semua endpoint `/v1` memakai header `x-api-key`; endpoint pesan per sesi juga menerima `Authorization: Bearer <token sesi>`.',
      '',
      '- Format error: `{ "error": { "code": "snake_case", "message": "..." } }`.',
      '- Pagination: `limit` (default 20, maksimum 100) + `cursor` opak → `{ "items": [...], "nextCursor": "..." }`.',
      '- Semua waktu ISO-8601 UTC; "hari ini" memakai `APP_TIMEZONE`.',
      '- SSE: `GET /v1/sessions/{id}/events` dibaca dengan `fetch` streaming + header `x-api-key` (bukan `EventSource`). Heartbeat dikirim setiap 15 detik.',
      '- Webhook keluar: header `X-Event-Id` (stabil antar retry) dan `X-Signature: sha256=<HMAC-SHA256 body dengan secret endpoint>`; timeout 10 detik, maksimal 3 percobaan dengan jeda 10 detik lalu 20 detik.',
      '- Event webhook: `message.status`, `message.received`, `session.status`, `broadcast.recipient`, `broadcast.status`.',
      '',
      'Contoh payload webhook:',
      '',
      '```json',
      JSON.stringify(
        {
          id: '0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f60',
          type: 'message.received',
          session_id: '0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f61',
          data: {
            message_id: '0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62',
            conversation_id: '0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63',
            from: '6281234567890@s.whatsapp.net',
            type: 'image',
            body: 'Gambar',
            occurred_at: '2026-11-17T03:00:00.000Z',
          },
        },
        null,
        2,
      ),
      '```',
      '',
      'Contoh event SSE (`message.received`):',
      '',
      '```text',
      'id: 0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65',
      'event: message.received',
      'data: {"message":{"id":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62","conversationId":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63","sessionId":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f61","direction":"in","type":"text","body":"Halo","status":"delivered","clientRef":null,"waMessageId":"3EB0...","createdAt":"2026-11-17T03:00:00.000Z"}}',
      '```',
    ].join('\n'),
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
  app.openAPIRegistry.registerComponent('securitySchemes', 'UserToken', {
    type: 'http',
    scheme: 'bearer',
    description: 'Bearer token login sales dari POST /auth/login.',
  })

  return app
}
