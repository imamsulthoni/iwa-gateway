import '../../src/infra/load-env.js'

import { fileURLToPath } from 'node:url'

import { migrate } from 'drizzle-orm/mysql2/migrator'

import { createDb } from '../../src/db/client.js'
import { validateEnv } from '../../src/infra/env.js'

export const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1'

export function testDatabaseUrl(): string {
  const env = validateEnv()
  if (!env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST wajib diisi untuk test integrasi')
  }
  return env.DATABASE_URL_TEST
}

export async function setupTestDb() {
  const connection = createDb(testDatabaseUrl())
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
  })
  return connection
}

const TABLES = [
  'webhook_deliveries',
  'webhook_endpoints',
  'message_status_events',
  'broadcast_recipients',
  'messages',
  'conversations',
  'broadcasts',
  'opt_outs',
  'wa_auth_keys',
  'wa_auth_creds',
  'wa_sessions',
  'api_keys',
]

export async function resetTestDb(pool: { query: (sql: string) => Promise<unknown> }) {
  await pool.query('SET FOREIGN_KEY_CHECKS = 0')
  for (const table of TABLES) {
    await pool.query(`TRUNCATE TABLE \`${table}\``)
  }
  await pool.query('SET FOREIGN_KEY_CHECKS = 1')
}
