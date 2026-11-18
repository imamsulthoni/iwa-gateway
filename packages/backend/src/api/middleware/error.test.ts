import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { createLogger } from '../../infra/logger.js'
import { DomainError } from '../../modules/errors.js'
import { handleError } from './error.js'

function createApp(code: string) {
  const app = new Hono()
  app.get('/', () => {
    throw new DomainError('gagal', code)
  })
  app.onError((error, c) => handleError(error, c, createLogger('silent')))
  return app
}

describe('pemetaan kode error domain', () => {
  it('memetakan NO_SESSION ke 403', async () => {
    const response = await createApp('NO_SESSION').request('/')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'NO_SESSION', message: 'gagal' },
    })
  })

  it('memetakan SALES_LIMIT_REACHED ke 409', async () => {
    const response = await createApp('SALES_LIMIT_REACHED').request('/')
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: { code: 'SALES_LIMIT_REACHED', message: 'gagal' },
    })
  })
})
