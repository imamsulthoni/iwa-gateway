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
    const sessions = createSessionsService(repo)
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

    await useDbAuthState(withAuth, {
      db: connection.db,
      cipher: createCipher(validateEnv().AUTH_ENC_KEY),
      logger: createLogger('silent'),
    })

    const manager = { start: vi.fn(async () => undefined) } as unknown as SessionManager
    const started = await bootstrapSessions({
      db: connection.db,
      sessions,
      manager,
      logger: createLogger('silent'),
    })

    expect(started).toBe(1)
    expect(manager.start).toHaveBeenCalledOnce()
    expect(manager.start).toHaveBeenCalledWith(expect.objectContaining({ id: withAuth }))
  })
})
