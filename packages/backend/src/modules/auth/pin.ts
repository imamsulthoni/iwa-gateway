import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const PREFIX = 'scrypt'
const SALT_BYTES = 16
const KEY_BYTES = 32

/**
 * PIN pendek mudah di-brute force, jadi disimpan dengan scrypt + salt acak.
 * Format: `scrypt$<salt base64url>$<hash base64url>`.
 */
export function hashPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES)
  const hash = scryptSync(pin, salt, KEY_BYTES)
  return `${PREFIX}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [prefix, saltPart, hashPart] = stored.split('$')
  if (prefix !== PREFIX || !saltPart || !hashPart) return false

  try {
    const salt = Buffer.from(saltPart, 'base64url')
    const expected = Buffer.from(hashPart, 'base64url')
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false
    const actual = scryptSync(pin, salt, expected.length)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
