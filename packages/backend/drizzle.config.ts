import './src/infra/load-env.js'

import { defineConfig } from 'drizzle-kit'

import { validateEnv } from './src/infra/env.js'

const env = validateEnv()

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
})
