import { Hono } from 'hono'

import { APP_NAME, APP_VERSION } from '../version.js'

export function createHealthRoute() {
  const router = new Hono()
  router.get('/', (c) => c.json({ name: APP_NAME, version: APP_VERSION, status: 'ok' }))
  return router
}
