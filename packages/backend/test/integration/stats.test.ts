import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { newId } from '../../src/db/id.js'
import { messages, waSessions } from '../../src/db/schema.js'
import { createMessagesRepository } from '../../src/modules/messages/repository.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const SENT = ['sent', 'delivered', 'read'] as const

describeIntegration('agregasi stats di repository pesan', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>
  let sessionId: string

  beforeAll(async () => {
    connection = await setupTestDb()
  })

  afterAll(async () => {
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
    sessionId = newId()
    await connection.db
      .insert(waSessions)
      .values({ id: sessionId, publicId: sessionId.slice(0, 32), label: 'Sesi', status: 'connected' })
  })

  async function insertMessage(
    createdAt: Date,
    status: 'sent' | 'failed',
    deletedAt: Date | null = null,
  ) {
    const id = newId()
    await connection.db.insert(messages).values({
      id,
      sessionId,
      direction: 'out',
      type: 'text',
      status,
      createdAt,
      deletedAt,
    })
    return id
  }

  it('menghitung rentang inklusif-awal eksklusif-akhir dan mengabaikan soft-delete', async () => {
    await insertMessage(new Date('2026-11-01T10:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-02T10:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-03T10:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-02T11:00:00.000Z'), 'failed')
    await insertMessage(new Date('2026-11-02T12:00:00.000Z'), 'sent', new Date('2026-11-02T13:00:00.000Z'))

    const repo = createMessagesRepository(connection.db)
    const start = new Date('2026-11-01T00:00:00.000Z')
    const end = new Date('2026-11-04T00:00:00.000Z')

    expect(await repo.countBetween(start, end, [...SENT])).toBe(3)
    expect(await repo.countBetween(start, end, ['failed'])).toBe(1)
    expect(await repo.countBetween(start, new Date('2026-11-02T00:00:00.000Z'), [...SENT])).toBe(1)
  })

  it('menghitung banyak bucket dalam satu query', async () => {
    await insertMessage(new Date('2026-11-01T10:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-01T11:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-02T10:00:00.000Z'), 'sent')
    await insertMessage(new Date('2026-11-02T11:00:00.000Z'), 'failed')
    await insertMessage(new Date('2026-11-02T12:00:00.000Z'), 'sent', new Date('2026-11-02T13:00:00.000Z'))

    const repo = createMessagesRepository(connection.db)
    const ranges = Array.from({ length: 12 }, (_, index) => ({
      start: new Date(Date.UTC(2026, 10, 1 + index)),
      end: new Date(Date.UTC(2026, 10, 2 + index)),
    }))

    const sent = await repo.countInBuckets(ranges, [...SENT])
    expect(sent).toHaveLength(12)
    expect(sent.slice(0, 3)).toEqual([2, 1, 0])
    expect(sent.every((value) => Number.isInteger(value))).toBe(true)

    expect(await repo.countInBuckets([], [...SENT])).toEqual([])
  })
})
