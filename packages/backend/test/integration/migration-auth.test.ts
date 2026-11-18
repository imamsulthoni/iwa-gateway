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
const UP_0002 = fileURLToPath(
  new URL('../../drizzle/0002_rapid_the_liberteens.sql', import.meta.url),
)
const UP_0003 = fileURLToPath(new URL('../../drizzle/0003_lethal_blizzard.sql', import.meta.url))
const DOWN_0003 = fileURLToPath(new URL('./fixtures/0003_down.sql', import.meta.url))

const SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0101'
const SECOND_SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0102'
const MESSAGE_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0103'
const USER_A_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0104'
const USER_B_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0105'

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

async function columnNames(connection: PoolConnection, table: string): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table],
  )
  return rows.map((row) => String(row.COLUMN_NAME))
}

async function nullableColumns(connection: PoolConnection, table: string): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND is_nullable = 'YES'`,
    [table],
  )
  return rows.map((row) => String(row.COLUMN_NAME))
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

async function tables(connection: PoolConnection): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>('SHOW TABLES')
  return rows.map((row) => String(Object.values(row)[0]))
}

async function insertUser(connection: PoolConnection, id: string, phone: string): Promise<void> {
  await connection.query(
    `INSERT INTO users (id, name, phone_number, role, pin_hash)
     VALUES (?, ?, ?, 'sales', 'scrypt$test')`,
    [id, `Sales ${phone}`, phone],
  )
}

describeIntegration('migrasi 0003 dengan data Fase 1', () => {
  let connection: Awaited<ReturnType<typeof createDb>>
  let pool: PoolConnection

  beforeAll(async () => {
    connection = createDb(testDatabaseUrl())
    pool = await connection.pool.getConnection()
    await dropAllTables(pool)
    await executeFile(pool, UP_0000)
    await executeFile(pool, UP_0001)
    await executeFile(pool, UP_0002)
    await pool.query(
      `INSERT INTO wa_sessions (id, public_id, label, phone_number, status, daily_send_limit)
       VALUES (?, 'migrasi-auth-1', 'Migrasi Auth 1', '6281111111101', 'connected', 200),
              (?, 'migrasi-auth-2', 'Migrasi Auth 2', '6281111111102', 'connected', 200)`,
      [SESSION_ID, SECOND_SESSION_ID],
    )
    await pool.query(
      `INSERT INTO messages (id, session_id, client_ref, direction, type, body, status)
       VALUES (?, ?, 'ref-auth-lama', 'out', 'text', 'Halo sebelum auth', 'sent')`,
      [MESSAGE_ID, SESSION_ID],
    )
    await executeFile(pool, UP_0003)
  })

  afterAll(async () => {
    await dropAllTables(pool)
    await migrate(connection.db, { migrationsFolder: DRIZZLE_FOLDER })
    pool.release()
    await connection.pool.end()
  }, 30000)

  it('menjaga data Fase 1 dan menambah tabel auth tanpa owner', async () => {
    expect(await tables(pool)).toEqual(
      expect.arrayContaining(['users', 'user_sessions', 'app_settings']),
    )
    expect(await columnNames(pool, 'wa_sessions')).toContain('owner_user_id')
    expect(await columnNames(pool, 'wa_sessions')).toEqual(
      expect.arrayContaining(['sales_id', 'agent_id']),
    )
    expect(await nullableColumns(pool, 'wa_sessions')).toContain('owner_user_id')
    expect(await indexes(pool, 'wa_sessions')).toContain('wa_sessions_owner_uq')

    const [settings] = await pool.query<RowDataPacket[]>('SELECT `key` FROM app_settings')
    expect(settings).toHaveLength(0)

    const [sessions] = await pool.query<RowDataPacket[]>(
      'SELECT id, owner_user_id FROM wa_sessions ORDER BY id',
    )
    expect(sessions).toHaveLength(2)
    expect(sessions.every((row) => row.owner_user_id === null)).toBe(true)

    const [message] = await pool.query<RowDataPacket[]>(
      'SELECT body, client_ref FROM messages WHERE id = ?',
      [MESSAGE_ID],
    )
    expect(message[0]).toMatchObject({ body: 'Halo sebelum auth', client_ref: 'ref-auth-lama' })
  })

  it('menegakkan unique telepon, owner tunggal, cascade token, dan set null owner', async () => {
    await insertUser(pool, USER_A_ID, '6281111111201')
    await insertUser(pool, USER_B_ID, '6281111111202')

    await expect(insertUser(pool, USER_B_ID, '6281111111201')).rejects.toThrow()
    await expect(
      insertUser(pool, '01a1ddfa-295a-7557-9bd3-00293fdc0108', '6281111111201'),
    ).rejects.toThrow()

    const [user] = await pool.query<RowDataPacket[]>(
      'SELECT role, active FROM users WHERE id = ?',
      [USER_B_ID],
    )
    expect(user[0]).toMatchObject({ role: 'sales', active: 1 })

    await pool.query(
      `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
       VALUES ('01a1ddfa-295a-7557-9bd3-00293fdc0106', ?, ?, '2026-12-01 00:00:00.000')`,
      [USER_A_ID, 'a'.repeat(64)],
    )

    await pool.query('UPDATE wa_sessions SET owner_user_id = ? WHERE id = ?', [
      USER_A_ID,
      SESSION_ID,
    ])
    await expect(
      pool.query('UPDATE wa_sessions SET owner_user_id = ? WHERE id = ?', [
        USER_A_ID,
        SECOND_SESSION_ID,
      ]),
    ).rejects.toThrow()

    await expect(
      pool.query(
        `INSERT INTO user_sessions (id, user_id, token_hash, expires_at)
         VALUES ('01a1ddfa-295a-7557-9bd3-00293fdc0107', ?, ?, '2026-12-01 00:00:00.000')`,
        [USER_A_ID, 'a'.repeat(64)],
      ),
    ).rejects.toThrow()

    await pool.query('DELETE FROM users WHERE id = ?', [USER_A_ID])

    const [session] = await pool.query<RowDataPacket[]>(
      'SELECT owner_user_id FROM wa_sessions WHERE id = ?',
      [SESSION_ID],
    )
    expect(session[0]?.owner_user_id).toBeNull()

    const [tokens] = await pool.query<RowDataPacket[]>(
      'SELECT id FROM user_sessions WHERE user_id = ?',
      [USER_A_ID],
    )
    expect(tokens).toHaveLength(0)
  })

  it('rollback manual menghapus tabel auth dan mempertahankan data Fase 1', async () => {
    await executeFile(pool, DOWN_0003)

    expect(await tables(pool)).not.toEqual(
      expect.arrayContaining(['users', 'user_sessions', 'app_settings']),
    )
    expect(await columnNames(pool, 'wa_sessions')).not.toContain('owner_user_id')

    const [message] = await pool.query<RowDataPacket[]>(
      'SELECT body FROM messages WHERE id = ?',
      [MESSAGE_ID],
    )
    expect(message[0]?.body).toBe('Halo sebelum auth')

    const [sessions] = await pool.query<RowDataPacket[]>('SELECT id FROM wa_sessions')
    expect(sessions).toHaveLength(2)
  })
})
