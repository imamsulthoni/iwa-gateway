import { randomUUID } from 'node:crypto'

import type { UserRole } from '@wbc/shared'

import type { UserRow } from '../../db/schema.js'
import { NoSessionError, UnauthorizedError } from '../errors.js'
import { verifyPin } from './pin.js'
import type { AuthRepository } from './repository.js'
import { generateUserToken, hashUserToken } from './user-token.js'

export const USER_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

const LOGIN_FAILED = 'Nomor atau PIN salah'

export type AuthUser = {
  id: string
  name: string
  phoneNumber: string
  role: UserRole
  active: boolean
}

export type AuthLoginResult = {
  token: string
  expiresAt: Date
  user: AuthUser
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    name: row.name,
    phoneNumber: row.phoneNumber,
    role: row.role,
    active: row.active,
  }
}

export type AuthService = ReturnType<typeof createAuthService>

export function createAuthService(repo: AuthRepository) {
  return {
    async login(phoneNumber: string, pin: string): Promise<AuthLoginResult> {
      const user = await repo.findUserByPhone(phoneNumber)
      if (!user || user.role !== 'sales' || !user.active || !verifyPin(pin, user.pinHash)) {
        throw new UnauthorizedError(LOGIN_FAILED)
      }

      const session = await repo.findOwnedSession(user.id)
      if (!session) throw new NoSessionError()

      const token = generateUserToken()
      const expiresAt = new Date(Date.now() + USER_TOKEN_TTL_MS)
      await repo.insertToken({
        id: randomUUID(),
        userId: user.id,
        tokenHash: hashUserToken(token),
        expiresAt,
      })

      return { token, expiresAt, user: toAuthUser(user) }
    },

    async authenticate(token: string): Promise<AuthUser | null> {
      if (!token) return null
      const record = await repo.findToken(hashUserToken(token))
      if (!record || record.expiresAt.getTime() <= Date.now()) return null
      const { user } = record
      if (!user.active || user.role !== 'sales') return null
      return toAuthUser(user)
    },

    async logout(token: string): Promise<void> {
      if (!token) return
      await repo.revokeToken(hashUserToken(token))
    },

    async me(userId: string): Promise<AuthUser | null> {
      const user = await repo.findUserById(userId)
      if (!user || !user.active || user.role !== 'sales') return null
      return toAuthUser(user)
    },
  }
}
