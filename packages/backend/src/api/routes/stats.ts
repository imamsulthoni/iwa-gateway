import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { statsQuerySchema, statsSchema } from '@wbc/shared'

import type { StatsService } from '../../modules/stats/service.js'
import type { AppBindings } from '../app.js'
import { openApiError } from '../openapi.js'

const statsRoute = createRoute({
  method: 'get',
  path: '/stats',
  tags: ['Stats'],
  summary: 'Statistik ringkas dashboard',
  security: [{ ApiKey: [] }],
  request: { query: statsQuerySchema },
  responses: {
    200: {
      description: 'Statistik sesi, pesan, dan broadcast',
      content: { 'application/json': { schema: statsSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    422: openApiError('Query tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createStatsRoute(stats: StatsService) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(statsRoute, async (c) => {
    const { period } = c.req.valid('query')
    return c.json(await stats.get(period), 200)
  })

  return router
}
