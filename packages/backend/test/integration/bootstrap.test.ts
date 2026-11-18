import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDbAuthState } from '../../src/baileys/auth-store.js'
import { newId } from '../../src/db/id.js'
import { waSessions } from '../../src/db/schema.js'
import { createCipher } from '../../src/infra/crypto.js'
import { validateEnv } from '../../src/infra/env.js'
import { createLogger } from '../../src/infra/logger.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { createSessionsService } from '../../src/modules/sessions/service.js'
import { bootstrapSessions } from '../../src/worker/bootstrap.js'
import type { SessionManager } from '../../src/worker/session-manager.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('bootstrap sesi worker', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>

  beforeAll(async () => {
    connection = await setupTestDb()
  })

  afterAll(async () => {
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
  })

  it('memuat sesi dengan auth dan melewati sesi tanpa auth', async () => {
    const repo = createSessionsRepository(connection.db)
    const sessions = createSessionsService(repo, {
      getSettings: async () => ({ maxSales: 10, salesCount: 0 }),
    })
    const withAuth = newId()
    const withoutAuth = newId()

    await connection.db.insert(waSessions).values([
      { id: withAuth, publicId: withAuth.slice(0, 32), label: 'Auth', status: 'disconnected' },
      {
        id: withoutAuth,
        publicId: withoutAuth.slice(0, 32),
        label: 'NoAuth',
        status: 'disconnected',
      },
    ])

    const cipher = createCipher(validateEnv().AUTH_ENC_KEY)
    const auth = await useDbAuthState(withAuth, {
      db: connection.db,
      cipher,
      logger: createLogger('silent'),
    })
    auth.state.creds.me = { id: '628123456789:1@s.whatsapp.net' }
    await auth.saveCreds()
    await auth.state.keys.set({
      session: { s1: Buffer.from('auth-seed') },
    } as never)

    const manager = { start: vi.fn(async () => undefined) } as unknown as SessionManager
    const started = await bootstrapSessions({
      db: connection.db,
      cipher,
      sessions,
      manager,
      logger: createLogger('silent'),
    })

    expect(started).toBe(1)
    expect(manager.start).toHaveBeenCalledOnce()
    expect(manager.start).toHaveBeenCalledWith(expect.objectContaining({ id: withAuth }))
  })
})
