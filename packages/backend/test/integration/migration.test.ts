import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/mysql2/migrator'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from '../../src/db/client.js'
import { RUN_INTEGRATION, testDatabaseUrl } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const DRIZZLE_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))
const UP_0000 = fileURLToPath(new URL('../../drizzle/0000_glorious_barracuda.sql', import.meta.url))
const UP_0001 = fileURLToPath(
  new URL('../../drizzle/0001_polite_wendell_vaughn.sql', import.meta.url),
)
const DOWN_0001 = fileURLToPath(new URL('./fixtures/0001_down.sql', import.meta.url))

const SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0001'
const MESSAGE_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0002'
const BROADCAST_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0003'

function statements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

async function executeFile(connection: PoolConnection, path: string): Promise<void> {
  for (const statement of statements(await readFile(path, 'utf8'))) {
    await connection.query(statement)
  }
}

async function dropAllTables(connection: PoolConnection): Promise<void> {
  await connection.query('SET FOREIGN_KEY_CHECKS = 0')
  const [rows] = await connection.query<RowDataPacket[]>('SHOW TABLES')
  for (const row of rows) {
    await connection.query(`DROP TABLE IF EXISTS \`${String(Object.values(row)[0])}\``)
  }
  await connection.query('SET FOREIGN_KEY_CHECKS = 1')
}

async function columns(connection: PoolConnection, table: string): Promise<RowDataPacket[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT column_name, column_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?
     ORDER BY ordinal_position`,
    [table],
  )
  return rows
}

async function columnNames(connection: PoolConnection, table: string): Promise<string[]> {
  return (await columns(connection, table)).map((row) => String(row.COLUMN_NAME))
}

async function indexes(connection: PoolConnection, table: string): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT DISTINCT index_name
     FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  )
  return rows.map((row) => String(row.INDEX_NAME))
}

async function foreignKeys(connection: PoolConnection, table: string): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT constraint_name
     FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE() AND table_name = ?`,
    [table],
  )
  return rows.map((row) => String(row.CONSTRAINT_NAME))
}

async function tables(connection: PoolConnection): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>('SHOW TABLES')
  return rows.map((row) => String(Object.values(row)[0]))
}

describeIntegration('migrasi 0001 dengan data Fase 1', () => {
  let connection: Awaited<ReturnType<typeof createDb>>
  let pool: PoolConnection

  beforeAll(async () => {
    connection = createDb(testDatabaseUrl())
    pool = await connection.pool.getConnection()
    await dropAllTables(pool)
    await executeFile(pool, UP_0000)
  })

  afterAll(async () => {
    await dropAllTables(pool)
    await migrate(connection.db, { migrationsFolder: DRIZZLE_FOLDER })
    pool.release()
    await connection.pool.end()
  }, 30000)

  it('backfill client_ref, mempertahankan data, dan menambah tabel Fase 2', async () => {
    await pool.query(
      `INSERT INTO wa_sessions (id, public_id, label, status, daily_send_limit)
       VALUES (?, 'migrasi', 'Migrasi', 'connected', 200)`,
      [SESSION_ID],
    )
    await pool.query(
      `INSERT INTO messages (id, session_id, reference_id, direction, type, body, status)
       VALUES (?, ?, 'ref-pesan-lama', 'out', 'text', 'Halo lama', 'sent')`,
      [MESSAGE_ID, SESSION_ID],
    )
    await pool.query(
      `INSERT INTO broadcasts (id, session_id, name, template, status, reference_id)
       VALUES (?, ?, 'Broadcast lama', 'Halo broadcast lama', 'done', 'ref-broadcast-lama')`,
      [BROADCAST_ID, SESSION_ID],
    )
    await pool.query(
      `INSERT INTO broadcast_recipients (broadcast_id, to_jid, name, contact_id, message_id, status)
       VALUES (?, '628123456789@s.whatsapp.net', 'Budi', ?, ?, 'sent')`,
      [BROADCAST_ID, '01a1ddfa-295a-7557-9bd3-00293fdc0004', MESSAGE_ID],
    )

    await executeFile(pool, UP_0001)

    const [message] = await pool.query<RowDataPacket[]>(
      'SELECT client_ref, body, conversation_id, type FROM messages WHERE id = ?',
      [MESSAGE_ID],
    )
    expect(message[0]).toMatchObject({
      client_ref: 'ref-pesan-lama',
      body: 'Halo lama',
      conversation_id: null,
      type: 'text',
    })

    const [broadcast] = await pool.query<RowDataPacket[]>(
      'SELECT text, client_ref, status FROM broadcasts WHERE id = ?',
      [BROADCAST_ID],
    )
    expect(broadcast[0]).toMatchObject({
      text: 'Halo broadcast lama',
      client_ref: 'ref-broadcast-lama',
      status: 'done',
    })

    const [recipient] = await pool.query<RowDataPacket[]>(
      'SELECT status FROM broadcast_recipients WHERE broadcast_id = ?',
      [BROADCAST_ID],
    )
    expect(recipient[0]?.status).toBe('sent')

    expect(await columnNames(pool, 'messages')).not.toContain('reference_id')
    expect(await columnNames(pool, 'broadcasts')).not.toContain('reference_id')
    expect(await columnNames(pool, 'broadcasts')).not.toContain('name')
    expect(await columnNames(pool, 'broadcast_recipients')).not.toContain('contact_id')
    expect(await columnNames(pool, 'broadcasts')).toEqual(
      expect.arrayContaining(['scheduled_at', 'started_at', 'finished_at']),
    )
    expect(await columnNames(pool, 'wa_sessions')).toEqual(
      expect.arrayContaining(['engine', 'auth_format', 'pairing_method']),
    )
    expect(await columnNames(pool, 'messages')).toContain('conversation_id')

    expect(await tables(pool)).toEqual(
      expect.arrayContaining([
        'conversations',
        'opt_outs',
        'webhook_endpoints',
        'webhook_deliveries',
      ]),
    )
    expect(await indexes(pool, 'messages')).toContain('messages_client_ref_uq')
    expect(await indexes(pool, 'messages')).toContain('messages_conv_time')
    expect(await indexes(pool, 'broadcasts')).toContain('broadcasts_client_ref_uq')
    expect(await indexes(pool, 'conversations')).toContain('conversations_session_recent')
    expect(await indexes(pool, 'webhook_deliveries')).toContain('webhook_deliveries_due')
    expect(await foreignKeys(pool, 'messages')).toContain(
      'messages_conversation_id_conversations_id_fk',
    )
    expect(await foreignKeys(pool, 'conversations')).toContain(
      'conversations_session_id_wa_sessions_id_fk',
    )
    expect(await foreignKeys(pool, 'webhook_deliveries')).toContain(
      'webhook_deliveries_endpoint_id_webhook_endpoints_id_fk',
    )
  })

  it('rollback mengembalikan skema dan data Fase 1', async () => {
    await executeFile(pool, DOWN_0001)

    expect(await columnNames(pool, 'messages')).toContain('reference_id')
    expect(await columnNames(pool, 'messages')).not.toContain('client_ref')
    expect(await columnNames(pool, 'messages')).not.toContain('conversation_id')
    expect(await columnNames(pool, 'broadcasts')).toContain('template')
    expect(await columnNames(pool, 'broadcasts')).toContain('name')
    expect(await columnNames(pool, 'broadcasts')).not.toContain('client_ref')
    expect(await columnNames(pool, 'broadcast_recipients')).toContain('contact_id')

    const [message] = await pool.query<RowDataPacket[]>(
      'SELECT reference_id FROM messages WHERE id = ?',
      [MESSAGE_ID],
    )
    expect(message[0]?.reference_id).toBe('ref-pesan-lama')

    const [broadcast] = await pool.query<RowDataPacket[]>(
      'SELECT template, reference_id FROM broadcasts WHERE id = ?',
      [BROADCAST_ID],
    )
    expect(broadcast[0]).toMatchObject({
      template: 'Halo broadcast lama',
      reference_id: 'ref-broadcast-lama',
    })

    expect(await tables(pool)).not.toEqual(
      expect.arrayContaining([
        'conversations',
        'opt_outs',
        'webhook_endpoints',
        'webhook_deliveries',
      ]),
    )
    expect(await indexes(pool, 'messages')).toContain('messages_session_reference_uq')
    expect(await indexes(pool, 'broadcasts')).toContain('broadcasts_session_reference_uq')
  })
})
