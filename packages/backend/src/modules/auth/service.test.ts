import { describe, expect, it } from 'vitest'

import type { UserRow, UserSessionRow, WaSessionRow } from '../../db/schema.js'
import { NoSessionError, UnauthorizedError } from '../errors.js'
import { hashPin } from './pin.js'
import type { AuthRepository } from './repository.js'
import { USER_TOKEN_TTL_MS, createAuthService } from './service.js'
import { hashUserToken } from './user-token.js'

const PIN = '123456'
const PIN_HASH = hashPin(PIN)

const USER: UserRow = {
  id: 'user-1',
  name: 'Sales A',
  phoneNumber: '628123456789',
  role: 'sales',
  pinHash: PIN_HASH,
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

function sessionFor(userId: string | null): WaSessionRow {
  return {
    id: 'session-1',
    publicId: 'sales-a',
    label: 'Sales A',
    engine: 'baileys',
    phoneNumber: USER.phoneNumber,
    status: 'connected',
    lastQr: null,
    lastConnectedAt: null,
    tokenHash: null,
    tokenRotatedAt: null,
    salesId: null,
    agentId: null,
    ownerUserId: userId,
    dailySendLimit: 200,
    authFormat: 'v7',
    pairingMethod: 'qr',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function createMemoryRepository(options: { users?: UserRow[]; sessions?: WaSessionRow[] } = {}) {
  const users = [...(options.users ?? [USER])]
  const sessions = [...(options.sessions ?? [sessionFor(USER.id)])]
  const tokens: UserSessionRow[] = []

  const repo: AuthRepository = {
    async findUserByPhone(phoneNumber) {
      return users.find((user) => user.phoneNumber === phoneNumber) ?? null
    },
    async findUserById(id) {
      return users.find((user) => user.id === id) ?? null
    },
    async countSales() {
      return users.filter((user) => user.role === 'sales').length
    },
    async insertUser(values) {
      users.push({
        role: 'sales',
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
      })
    },
    async deleteUser(id) {
      const index = users.findIndex((user) => user.id === id)
      if (index >= 0) users.splice(index, 1)
    },
    async insertToken(values) {
      tokens.push({ createdAt: new Date(), ...values })
    },
    async findToken(tokenHash) {
      const token = tokens.find((row) => row.tokenHash === tokenHash)
      if (!token) return null
      const user = users.find((row) => row.id === token.userId)
      if (!user) return null
      return { tokenHash: token.tokenHash, expiresAt: token.expiresAt, user }
    },
    async revokeToken(tokenHash) {
      const index = tokens.findIndex((row) => row.tokenHash === tokenHash)
      if (index >= 0) tokens.splice(index, 1)
    },
    async revokeTokensForUser(userId) {
      for (let index = tokens.length - 1; index >= 0; index -= 1) {
        if (tokens[index]?.userId === userId) tokens.splice(index, 1)
      }
    },
    async findOwnedSession(userId) {
      return sessions.find((row) => row.ownerUserId === userId) ?? null
    },
  }

  return { repo, users, sessions, tokens }
}

describe('auth service', () => {
  it('login sukses membuat token 7 hari tersimpan sebagai hash', async () => {
    const { repo, tokens } = createMemoryRepository()
    const service = createAuthService(repo)
    const before = Date.now()

    const result = await service.login(USER.phoneNumber, PIN)

    expect(result.user).toEqual({
      id: USER.id,
      name: USER.name,
      phoneNumber: USER.phoneNumber,
      role: 'sales',
      active: true,
    })
    expect(result.user).not.toHaveProperty('pinHash')
    expect(Buffer.from(result.token, 'base64url')).toHaveLength(32)
    expect(result.expiresAt.getTime() - before).toBeGreaterThanOrEqual(USER_TOKEN_TTL_MS)
    expect(tokens).toHaveLength(1)
    expect(tokens[0]?.tokenHash).toBe(hashUserToken(result.token))
    expect(tokens[0]?.tokenHash).not.toBe(result.token)
  })

  it('pesan gagal sama untuk nomor tidak terdaftar, PIN salah, dan user nonaktif', async () => {
    const service = createAuthService(createMemoryRepository().repo)
    const inactive = createAuthService(
      createMemoryRepository({ users: [{ ...USER, active: false }] }).repo,
    )

    await expect(service.login('628000000000', PIN)).rejects.toThrow('Nomor atau PIN salah')
    await expect(service.login(USER.phoneNumber, '654321')).rejects.toThrow('Nomor atau PIN salah')
    await expect(inactive.login(USER.phoneNumber, PIN)).rejects.toThrow('Nomor atau PIN salah')
    await expect(service.login(USER.phoneNumber, '654321')).rejects.toBeInstanceOf(
      UnauthorizedError,
    )
  })

  it('menolak sales yang belum punya sesi dengan NO_SESSION', async () => {
    const service = createAuthService(createMemoryRepository({ sessions: [] }).repo)

    const error = await service.login(USER.phoneNumber, PIN).catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(NoSessionError)
    expect((error as NoSessionError).code).toBe('NO_SESSION')
  })

  it('authenticate menolak token tidak dikenal, kedaluwarsa, dan user nonaktif', async () => {
    const { repo, tokens } = createMemoryRepository()
    const service = createAuthService(repo)
    const { token } = await service.login(USER.phoneNumber, PIN)

    expect(await service.authenticate(token)).toMatchObject({ id: USER.id, role: 'sales' })
    expect(await service.authenticate('token-lain')).toBeNull()

    tokens.push({
      id: 'token-expired',
      userId: USER.id,
      tokenHash: hashUserToken('token-expired'),
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(),
    })
    expect(await service.authenticate('token-expired')).toBeNull()

    const inactive = createMemoryRepository({ users: [{ ...USER, active: false }] }).repo
    const inactiveService = createAuthService(inactive)
    await expect(inactiveService.authenticate(token)).resolves.toBeNull()
  })

  it('logout idempoten dan mencabut token', async () => {
    const { repo, tokens } = createMemoryRepository()
    const service = createAuthService(repo)
    const { token } = await service.login(USER.phoneNumber, PIN)

    await service.logout(token)
    expect(tokens).toHaveLength(0)
    await expect(service.logout(token)).resolves.toBeUndefined()
    expect(await service.authenticate(token)).toBeNull()
    await expect(service.logout('')).resolves.toBeUndefined()
  })

  it('me mengembalikan user aktif atau null', async () => {
    const active = createAuthService(createMemoryRepository().repo)
    const inactive = createAuthService(
      createMemoryRepository({ users: [{ ...USER, active: false }] }).repo,
    )

    expect(await active.me(USER.id)).toMatchObject({ id: USER.id, name: 'Sales A' })
    expect(await active.me('tidak-ada')).toBeNull()
    expect(await inactive.me(USER.id)).toBeNull()
  })
})
