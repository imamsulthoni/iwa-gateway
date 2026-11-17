import { describe, expect, it } from 'vitest'

import { EnvValidationError, validateEnv } from './env.js'

const VALID = {
  DATABASE_URL: 'mysql://wa:wa@localhost:3306/wa_bot',
  REDIS_URL: 'redis://localhost:6379',
  AUTH_ENC_KEY: Buffer.alloc(32).toString('base64'),
}

describe('validasi env', () => {
  it('import modul tidak memvalidasi env', async () => {
    await expect(import('./env.js')).resolves.toBeDefined()
  })

  it('menerima env minimal dan memakai default', () => {
    const env = validateEnv(VALID)
    expect(env.PORT).toBe(3000)
    expect(env.APP_TIMEZONE).toBe('Asia/Jakarta')
    expect(env.NODE_ENV).toBe('development')
  })

  it('menyebut nama variabel yang hilang', () => {
    try {
      validateEnv({})
      throw new Error('seharusnya gagal')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      expect((error as Error).message).toContain('DATABASE_URL')
      expect((error as Error).message).toContain('REDIS_URL')
      expect((error as Error).message).toContain('AUTH_ENC_KEY')
    }
  })

  it('menolak AUTH_ENC_KEY bukan 32 byte', () => {
    expect(() =>
      validateEnv({ ...VALID, AUTH_ENC_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(EnvValidationError)
  })

  it('menolak LOG_LEVEL tidak dikenal', () => {
    expect(() => validateEnv({ ...VALID, LOG_LEVEL: 'verbose' })).toThrow(EnvValidationError)
  })

  it('membaca WEBHOOK_ALLOW_HTTP_PRIVATE sebagai boolean', () => {
    expect(validateEnv(VALID).WEBHOOK_ALLOW_HTTP_PRIVATE).toBe(false)
    expect(
      validateEnv({ ...VALID, WEBHOOK_ALLOW_HTTP_PRIVATE: 'true' }).WEBHOOK_ALLOW_HTTP_PRIVATE,
    ).toBe(true)
  })
})
