import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  webhookDeliveryListSchema,
  webhookDeliveryQuerySchema,
  webhookEndpointCreatedSchema,
  webhookEndpointListSchema,
  webhookEndpointSchema,
  webhookSecretSchema,
} from '@wa/shared'

import type { WebhooksService } from '../../modules/webhooks/service.js'
import type { AppBindings } from '../app.js'
import { idParamSchema, openApiError } from '../openapi.js'

const apiKeySecurity = [{ ApiKey: [] }]

const listEndpointsRoute = createRoute({
  method: 'get',
  path: '/webhooks',
  tags: ['Webhooks'],
  summary: 'Daftar endpoint webhook',
  security: apiKeySecurity,
  responses: {
    200: {
      description: 'Endpoint webhook tanpa secret',
      content: { 'application/json': { schema: webhookEndpointListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const createEndpointRoute = createRoute({
  method: 'post',
  path: '/webhooks',
  tags: ['Webhooks'],
  summary: 'Daftarkan endpoint webhook',
  security: apiKeySecurity,
  request: {
    body: {
      content: { 'application/json': { schema: createWebhookEndpointSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      description: 'Endpoint dibuat; secret hanya tampil sekali',
      content: { 'application/json': { schema: webhookEndpointCreatedSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    422: openApiError('URL atau event tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const updateEndpointRoute = createRoute({
  method: 'patch',
  path: '/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Perbarui endpoint webhook',
  security: apiKeySecurity,
  request: {
    params: idParamSchema,
    body: {
      content: { 'application/json': { schema: updateWebhookEndpointSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: 'Endpoint diperbarui',
      content: { 'application/json': { schema: webhookEndpointSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Endpoint tidak ditemukan'),
    422: openApiError('URL atau event tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const deleteEndpointRoute = createRoute({
  method: 'delete',
  path: '/webhooks/{id}',
  tags: ['Webhooks'],
  summary: 'Hapus endpoint webhook',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Endpoint dihapus' },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Endpoint tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const rotateSecretRoute = createRoute({
  method: 'post',
  path: '/webhooks/{id}/rotate-secret',
  tags: ['Webhooks'],
  summary: 'Rotasi secret endpoint webhook',
  security: apiKeySecurity,
  request: { params: idParamSchema },
  responses: {
    200: {
      description: 'Secret baru; hanya tampil sekali',
      content: { 'application/json': { schema: webhookSecretSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Endpoint tidak ditemukan'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

const listDeliveriesRoute = createRoute({
  method: 'get',
  path: '/webhooks/{id}/deliveries',
  tags: ['Webhooks'],
  summary: 'Log pengiriman endpoint webhook',
  security: apiKeySecurity,
  request: { params: idParamSchema, query: webhookDeliveryQuerySchema },
  responses: {
    200: {
      description: 'Halaman log pengiriman',
      content: { 'application/json': { schema: webhookDeliveryListSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    404: openApiError('Endpoint tidak ditemukan'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createWebhooksRoute(webhooks: WebhooksService) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(listEndpointsRoute, async (c) => {
    return c.json({ items: await webhooks.list() }, 200)
  })

  router.openapi(createEndpointRoute, async (c) => {
    const endpoint = await webhooks.create(c.req.valid('json'))
    return c.json(endpoint, 201)
  })

  router.openapi(updateEndpointRoute, async (c) => {
    const endpoint = await webhooks.update(c.req.param('id'), c.req.valid('json'))
    return c.json(endpoint, 200)
  })

  router.openapi(deleteEndpointRoute, async (c) => {
    await webhooks.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  router.openapi(rotateSecretRoute, async (c) => {
    return c.json(await webhooks.rotateSecret(c.req.param('id')), 200)
  })

  router.openapi(listDeliveriesRoute, async (c) => {
    const query = c.req.valid('query')
    const page = await webhooks.listDeliveries(
      c.req.param('id'),
      query.limit,
      query.status,
      query.cursor,
    )
    return c.json(page, 200)
  })

  return router
}
