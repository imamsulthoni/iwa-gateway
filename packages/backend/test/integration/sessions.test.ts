import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { newId } from '../../src/db/id.js'
import { waSessions } from '../../src/db/schema.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('status sesi saat socket berhenti', () => {
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

  async function insertSession(status: 'connected' | 'connecting' | 'logged_out') {
    const id = newId()
    await connection.db
      .insert(waSessions)
      .values({ id, publicId: id.slice(0, 32), label: 'Sesi', status })
    return id
  }

  it('menurunkan status sesi hidup ke disconnected', async () => {
    const repo = createSessionsRepository(connection.db)
    const connectedId = await insertSession('connected')
    const connectingId = await insertSession('connecting')

    expect(await repo.markDisconnectedIfLive(connectedId)).toBe(true)
    expect(await repo.markDisconnectedIfLive(connectingId)).toBe(true)
    expect((await repo.findById(connectedId))?.status).toBe('disconnected')
    expect((await repo.findById(connectingId))?.status).toBe('disconnected')
  })

  it('tidak menimpa status logged_out', async () => {
    const repo = createSessionsRepository(connection.db)
    const sessionId = await insertSession('logged_out')

    expect(await repo.markDisconnectedIfLive(sessionId)).toBe(false)
    expect((await repo.findById(sessionId))?.status).toBe('logged_out')
  })
})
