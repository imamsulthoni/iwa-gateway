import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export function generateUserToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashUserToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyUserToken(token: string, tokenHash: string): boolean {
  const expected = Buffer.from(hashUserToken(token), 'hex')
  const actual = Buffer.from(tokenHash, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
