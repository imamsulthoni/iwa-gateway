import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { newId } from '../../src/db/id.js'
import { apiKeys, messages } from '../../src/db/schema.js'
import { createApiKeyAuthenticator, hashApiKey } from '../../src/modules/auth/api-key.js'
import { createMessagesRepository } from '../../src/modules/messages/repository.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('integrasi MySQL', () => {
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

  async function insertSession(publicId = 's1') {
    const repo = createSessionsRepository(connection.db)
    const id = newId()
    await repo.insert({ id, publicId, label: 'Sesi', status: 'created' })
    return id
  }

  it('menyimpan dan membaca waktu UTC persis', async () => {
    const id = newId()
    const createdAt = new Date('2026-01-02T03:04:05.678Z')
    await createSessionsRepository(connection.db).insert({
      id,
      publicId: 'utc',
      label: 'UTC',
      status: 'created',
      createdAt,
    })

    const row = await createSessionsRepository(connection.db).findById(id)
    expect(row?.createdAt.toISOString()).toBe(createdAt.toISOString())
  })

  it('insert pesan idempoten hanya menghasilkan satu baris', async () => {
    const sessionId = await insertSession()
    const repo = createMessagesRepository(connection.db)
    const values = {
      id: newId(),
      sessionId,
      referenceId: 'ref-1',
      body: 'Halo',
      toJid: '628123456789@s.whatsapp.net',
      direction: 'out' as const,
      type: 'text',
      status: 'queued' as const,
    }

    const first = await repo.insertIdempotent(values)
    const second = await repo.insertIdempotent({ ...values, id: newId() })

    expect(first.duplicate).toBe(false)
    expect(second.duplicate).toBe(true)
    expect(second.row.id).toBe(first.row.id)

    const rows = await connection.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
    expect(rows).toHaveLength(1)
  })

  it('pesan soft-deleted tidak muncul di daftar', async () => {
    const sessionId = await insertSession()
    const repo = createMessagesRepository(connection.db)
    const first = await repo.insertIdempotent({
      id: newId(),
      sessionId,
      referenceId: 'a',
      body: 'A',
      direction: 'out',
      type: 'text',
      status: 'queued',
    })
    await repo.insertIdempotent({
      id: newId(),
      sessionId,
      referenceId: 'b',
      body: 'B',
      direction: 'out',
      type: 'text',
      status: 'queued',
    })

    expect(await repo.softDelete(first.row.id)).toBe(true)
    const page = await repo.listBySession(sessionId, 20)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.referenceId).toBe('b')
  })

  it('API key dicabut gagal diverifikasi', async () => {
    const auth = createApiKeyAuthenticator(connection.db)
    const plaintext = 'wa_integrasi'
    const id = newId()
    await connection.db.insert(apiKeys).values({ id, name: 'test', keyHash: hashApiKey(plaintext) })

    expect(await auth.findActive(plaintext)).toEqual({ id })
    await connection.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id)))
    expect(await auth.findActive(plaintext)).toBeNull()
  })

  it('collation key_id adalah utf8mb4_bin', async () => {
    const [rows] = await connection.pool.query(
      "SELECT COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wa_auth_keys' AND COLUMN_NAME = 'key_id'",
    )
    const result = rows as { COLLATION_NAME: string }[]
    expect(result[0]?.COLLATION_NAME).toBe('utf8mb4_bin')
  })

  it('tidak ada kolom tenant_id', async () => {
    const [rows] = await connection.pool.query(
      "SELECT COUNT(*) AS total FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'tenant_id'",
    )
    const result = rows as { total: number }[]
    expect(Number(result[0]?.total ?? 0)).toBe(0)
  })
})
