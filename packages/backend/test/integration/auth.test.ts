import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp, type AppDependencies } from '../../src/api/app.js'
import { newId } from '../../src/db/id.js'
import { apiKeys } from '../../src/db/schema.js'
import { validateEnv } from '../../src/infra/env.js'
import { createLogger } from '../../src/infra/logger.js'
import { closeRedis, createRedis, type RedisClient } from '../../src/infra/redis.js'
import { createApiKeyAuthenticator, hashApiKey } from '../../src/modules/auth/api-key.js'
import { createAuthRepository } from '../../src/modules/auth/repository.js'
import { createAuthService } from '../../src/modules/auth/service.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { createSessionsService } from '../../src/modules/sessions/service.js'
import { createSettingsRepository } from '../../src/modules/settings/repository.js'
import { createSettingsService } from '../../src/modules/settings/service.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const API_KEY = 'wa_integration_auth'

let seq = 0
function uniquePhone(): string {
  seq += 1
  return `628${String(Date.now()).slice(-8)}${String(seq).padStart(2, '0')}`
}

describeIntegration('integrasi alur auth sales', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let redis: RedisClient
  let app: ReturnType<typeof createApp>
  let sessions: ReturnType<typeof createSessionsService>

  beforeAll(async () => {
    connection = await setupTestDb()
    redis = createRedis(validateEnv().REDIS_URL)
  })

  afterAll(async () => {
    await closeRedis(redis)
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
    const loginKeys = await redis.keys('rl:login:*')
    if (loginKeys.length > 0) await redis.del(...loginKeys)
    await connection.db.insert(apiKeys).values({
      id: newId(),
      name: 'auth',
      keyHash: hashApiKey(API_KEY),
    })

    const settings = createSettingsService(createSettingsRepository(connection.db))
    sessions = createSessionsService(createSessionsRepository(connection.db), settings)
    app = createApp({
      env: validateEnv(),
      logger: createLogger('silent'),
      redis,
      db: connection.db,
      auth: createApiKeyAuthenticator(connection.db),
      userAuth: createAuthService(createAuthRepository(connection.db)),
      sessions,
      messages: {} as unknown as AppDependencies['messages'],
      conversations: {} as unknown as AppDependencies['conversations'],
      broadcasts: { current: async () => null } as unknown as AppDependencies['broadcasts'],
      stats: {} as unknown as AppDependencies['stats'],
      settings,
      webhooks: {} as unknown as AppDependencies['webhooks'],
      queues: { send: { add: vi.fn() }, broadcast: { add: vi.fn() } } as never,
    })
  })

  function login(phoneNumber: string, pin: string) {
    return app.request('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber, pin }),
    })
  }

  async function loginToken(phoneNumber: string, pin: string): Promise<string> {
    const response = await login(phoneNumber, pin)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { token: string }
    return body.token
  }

  it('login → nomor sendiri 200 → nomor lain 403 → logout → token 401 → hapus sesi → login gagal', async () => {
    const phoneA = uniquePhone()
    const phoneB = uniquePhone()
    const a = await sessions.create({
      label: 'Sales A',
      salesName: 'Sales A',
      phoneNumber: phoneA,
      pin: '123456',
    })
    const b = await sessions.create({
      label: 'Sales B',
      salesName: 'Sales B',
      phoneNumber: phoneB,
      pin: '123456',
    })

    expect((await login(phoneA, '000000')).status).toBe(401)
    const token = await loginToken(phoneA, '123456')
    const headers = { authorization: `Bearer ${token}` }

    expect((await app.request(`/sessions/${a.session.id}`, { headers })).status).toBe(200)
    expect((await app.request(`/sessions/${b.session.id}`, { headers })).status).toBe(403)

    expect((await app.request('/auth/logout', { method: 'POST', headers })).status).toBe(204)
    expect((await app.request(`/sessions/${a.session.id}`, { headers })).status).toBe(401)

    const adminDelete = await app.request(`/sessions/${a.session.id}`, {
      method: 'DELETE',
      headers: { 'x-api-key': API_KEY },
    })
    expect(adminDelete.status).toBe(204)
    expect((await login(phoneA, '123456')).status).toBe(401)
  })

  it('reset PIN membuat PIN dan token lama tidak berlaku', async () => {
    const phone = uniquePhone()
    const { session } = await sessions.create({
      label: 'Sales',
      salesName: 'Sales',
      phoneNumber: phone,
      pin: '123456',
    })
    const token = await loginToken(phone, '123456')

    const reset = await app.request(`/sessions/${session.id}/sales/pin`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ pin: '654321' }),
    })
    expect(reset.status).toBe(200)

    expect(
      (await app.request(`/sessions/${session.id}`, { headers: { authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(401)
    expect((await login(phone, '123456')).status).toBe(401)
    expect((await login(phone, '654321')).status).toBe(200)
  })

  it('tautkan sales ke sesi lama lalu login memakai nomor sesi', async () => {
    const phone = uniquePhone()
    const { session } = await sessions.create({ label: 'Lama', phoneNumber: phone })
    expect(session.salesName).toBeNull()

    const denied = await app.request(`/sessions/${session.id}/sales`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ salesName: 'Rani', pin: '123456' }),
    })
    expect(denied.status).toBe(401)

    const attached = await app.request(`/sessions/${session.id}/sales`, {
      method: 'PATCH',
      headers: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ salesName: 'Rani', pin: '123456' }),
    })
    expect(attached.status).toBe(200)
    expect(await attached.json()).toMatchObject({ salesName: 'Rani' })

    const token = await loginToken(phone, '123456')
    expect(
      (await app.request(`/sessions/${session.id}`, { headers: { authorization: `Bearer ${token}` } }))
        .status,
    ).toBe(200)
  })
})