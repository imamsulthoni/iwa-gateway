import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { settingsSchema, updateSettingsSchema } from '@wa/shared'

import type { SettingsService } from '../../modules/settings/service.js'
import type { AppBindings } from '../app.js'
import { openApiError } from '../openapi.js'

const apiKeySecurity = [{ ApiKey: [] }]

const getSettingsRoute = createRoute({
  method: 'get',
  path: '/settings',
  tags: ['Settings'],
  summary: 'Batas jumlah sales dan jumlah sales aktif',
  security: apiKeySecurity,
  responses: {
    200: {
      description: 'maxSales dan salesCount',
      content: { 'application/json': { schema: settingsSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    403: openApiError('Akses khusus admin'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const updateSettingsRoute = createRoute({
  method: 'patch',
  path: '/settings',
  tags: ['Settings'],
  summary: 'Ubah batas jumlah sales',
  security: apiKeySecurity,
  request: {
    body: {
      content: { 'application/json': { schema: updateSettingsSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Setting tersimpan',
      content: { 'application/json': { schema: settingsSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    403: openApiError('Akses khusus admin'),
    422: openApiError('maxSales harus 1 sampai 100'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createSettingsRoute(settings: SettingsService) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(getSettingsRoute, async (c) => c.json(await settings.getSettings(), 200))

  router.openapi(updateSettingsRoute, async (c) => {
    const input = c.req.valid('json')
    return c.json(await settings.updateSettings(input), 200)
  })

  return router
}