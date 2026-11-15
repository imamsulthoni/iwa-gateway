import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12

export type Cipher = {
  encrypt: (plaintext: string) => string
  decrypt: (payload: string) => string
}

export function createCipher(base64Key: string): Cipher {
  const key = Buffer.from(base64Key, 'base64')
  if (key.length !== 32) {
    throw new Error('AUTH_ENC_KEY harus 32 byte base64')
  }

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, iv)
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join('.')
    },
    decrypt(payload: string): string {
      const [ivPart, tagPart, dataPart] = payload.split('.')
      if (!ivPart || !tagPart || !dataPart) {
        throw new Error('Payload terenkripsi tidak valid')
      }
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64'))
      decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
      return Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    },
  }
}
