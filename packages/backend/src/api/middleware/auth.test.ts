import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { describe, expect, it } from 'vitest'

import { createLogger } from '../../infra/logger.js'
import type { AppBindings } from '../app.js'
import { ensureSessionAccess, requireAdmin, type Actor } from './auth.js'
import { handleError } from './error.js'

const OWNER: Actor = {
  mode: 'sales',
  user: {
    id: 'user-1',
    name: 'Sales A',
    phoneNumber: '628123456789',
    role: 'sales',
    active: true,
  },
}

const OTHER: Actor = {
  mode: 'sales',
  user: {
    id: 'user-2',
    name: 'Sales B',
    phoneNumber: '628987654321',
    role: 'sales',
    active: true,
  },
}

const ADMIN: Actor = { mode: 'admin', apiKeyId: 'key-1' }

const SESSION = {
  id: 'session-1',
  label: 'Nomor Sales A',
  ownerUserId: 'user-1',
}

function createTestApp(actor: Actor | undefined) {
  const app = new Hono<AppBindings>()

  app.use(
    '*',
    createMiddleware<AppBindings>(async (c, next) => {
      if (actor) c.set('actor', actor)
      await next()
    }),
  )

  app.get('/admin', (c) => {
    requireAdmin(c)
    return c.json({ ok: true })
  })

  app.get('/session', (c) => {
    ensureSessionAccess(c, SESSION)
    return c.json({ ok: true })
  })

  app.onError((error, c) => handleError(error, c, createLogger('silent')))

  return app
}

describe('requireAdmin', () => {
  it('meloloskan admin', async () => {
    const response = await createTestApp(ADMIN).request('/admin')
    expect(response.status).toBe(200)
  })

  it('menolak sales dengan 403', async () => {
    const response = await createTestApp(OWNER).request('/admin')
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: 'FORBIDDEN', message: 'Akses khusus admin' },
    })
  })

  it('menolak tanpa aktor dengan 401', async () => {
    const response = await createTestApp(undefined).request('/admin')
    expect(response.status).toBe(401)
  })
})

describe('ensureSessionAccess', () => {
  it('meloloskan admin untuk semua sesi', async () => {
    const response = await createTestApp(ADMIN).request('/session')
    expect(response.status).toBe(200)
  })

  it('meloloskan sales pemilik sesi', async () => {
    const response = await createTestApp(OWNER).request('/session')
    expect(response.status).toBe(200)
  })

  it('menolak sales bukan pemilik tanpa membocorkan detail sesi', async () => {
    const response = await createTestApp(OTHER).request('/session')
    expect(response.status).toBe(403)
    const body = (await response.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('FORBIDDEN')
    expect(body.error.message).toBe('Akses ke sesi ini ditolak')
    expect(JSON.stringify(body)).not.toContain(SESSION.id)
    expect(JSON.stringify(body)).not.toContain(SESSION.label)
    expect(JSON.stringify(body)).not.toContain('user-1')
  })

  it('menolak sales untuk sesi lama tanpa owner', async () => {
    const app = createTestApp(OWNER)
    // Sesi Fase 1 memiliki owner_user_id NULL dan hanya boleh diakses admin.
    app.get('/legacy', (c) => {
      ensureSessionAccess(c, { ownerUserId: null })
      return c.json({ ok: true })
    })

    const response = await app.request('/legacy')
    expect(response.status).toBe(403)
  })

  it('menolak tanpa aktor dengan 401', async () => {
    const response = await createTestApp(undefined).request('/session')
    expect(response.status).toBe(401)
  })
})