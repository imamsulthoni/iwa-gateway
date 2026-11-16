import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_TEST: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1),
  AUTH_ENC_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, 'base64').length === 32,
      'AUTH_ENC_KEY harus 32 byte base64',
    ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_TIMEZONE: z.string().min(1).default('Asia/Jakarta'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  BROWSER_NAME: z.string().min(1).default('WA Bot Service'),
  SESSION_LOCK_TTL_MS: z.coerce.number().int().positive().default(30000),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(240),
  BROADCAST_AUTO_PAUSE_RATIO: z.coerce.number().min(0).max(1).default(0.2),
  LOG_DIR: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError'
}

export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))]
    throw new EnvValidationError(`Env tidak valid: ${names.join(', ')}`)
  }
  return result.data
}

let current: Env | undefined

export function setEnv(env: Env): void {
  current = env
}

export function getEnv(): Env {
  if (!current) {
    throw new Error('Env belum divalidasi. Panggil setEnv(validateEnv()) di entry proses.')
  }
  return current
}
