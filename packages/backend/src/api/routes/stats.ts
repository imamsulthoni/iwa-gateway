import { Hono } from 'hono'

import type { StatsService } from '../../modules/stats/service.js'
import type { AppBindings } from '../app.js'

export function createStatsRoute(stats: StatsService) {
  const router = new Hono<AppBindings>()
  router.get('/stats', async (c) => c.json(await stats.get()))
  return router
}
