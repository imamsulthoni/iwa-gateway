import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifySessionToken(token: string, tokenHash: string): boolean {
  const expected = Buffer.from(hashSessionToken(token), 'hex')
  const actual = Buffer.from(tokenHash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
