import { OpenAPIHono } from '@hono/zod-openapi'

import type { AppBindings } from '../app.js'

export function createOptOutsRoute() {
  return new OpenAPIHono<AppBindings>()
}
