import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { statsSchema } from '@wa/shared'

import type { StatsService } from '../../modules/stats/service.js'
import type { AppBindings } from '../app.js'
import { openApiError } from '../openapi.js'

const statsRoute = createRoute({
  method: 'get',
  path: '/stats',
  tags: ['Stats'],
  summary: 'Statistik ringkas dashboard',
  security: [{ ApiKey: [] }],
  responses: {
    200: {
      description: 'Statistik sesi, pesan, dan broadcast',
      content: { 'application/json': { schema: statsSchema } },
    },
    401: openApiError('API key tidak dikirim atau tidak valid'),
    429: openApiError('Rate limit terlampaui'),
    500: openApiError('Kesalahan internal'),
  },
})

export function createStatsRoute(stats: StatsService) {
  const router = new OpenAPIHono<AppBindings>()

  router.openapi(statsRoute, async (c) => c.json(await stats.get(), 200))

  return router
}
