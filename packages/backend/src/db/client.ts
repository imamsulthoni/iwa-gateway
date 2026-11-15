import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import { createPool, type Pool } from 'mysql2/promise'

import * as schema from './schema.js'

export type Database = MySql2Database<typeof schema>

export type Db = {
  db: Database
  pool: Pool
}

export function createDb(url: string): Db {
  const parsed = new URL(url)
  const pool = createPool({
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    timezone: 'Z',
    connectionLimit: 10,
    supportBigNumbers: true,
  })
  const db = drizzle(pool, { schema, mode: 'default' })
  return { db: db as Database, pool }
}

export async function closeDb({ pool }: Db): Promise<void> {
  await pool.end()
}
