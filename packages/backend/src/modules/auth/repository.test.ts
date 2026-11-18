import { describe, expect, it } from 'vitest'

import type { Database } from '../../db/client.js'
import type { UserRow } from '../../db/schema.js'
import { createAuthRepository } from './repository.js'

const USER: UserRow = {
  id: 'user-1',
  name: 'Sales A',
  phoneNumber: '628123456789',
  role: 'sales',
  pinHash: 'scrypt$salt$hash',
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

type FakeRow = Record<string, unknown>

function createFakeDb(rows: FakeRow[] = []) {
  const ops: string[] = []
  const inserted: unknown[] = []

  function chain() {
    const builder = {
      from: () => builder,
      innerJoin: () => {
        ops.push('join')
        return builder
      },
      where: () => {
        ops.push('where')
        return builder
      },
      limit: async () => rows,
      then: (resolve: (value: FakeRow[]) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }
    return builder
  }

  const db = {
    select: () => {
      ops.push('select')
      return chain()
    },
    insert: () => ({
      values: async (values: unknown) => {
        ops.push('insert')
        inserted.push(values)
      },
    }),
    delete: () => ({
      where: async () => {
        ops.push('delete')
      },
    }),
  }

  return { db: db as unknown as Database, ops, inserted }
}

describe('repository auth', () => {
  it('mencari user lewat nomor dan id', async () => {
    const { db } = createFakeDb([USER as unknown as FakeRow])
    const repo = createAuthRepository(db)

    expect(await repo.findUserByPhone('628123456789')).toEqual(USER)
    expect(await repo.findUserById('user-1')).toEqual(USER)
  })

  it('mengembalikan null saat user tidak ada', async () => {
    const repo = createAuthRepository(createFakeDb().db)

    expect(await repo.findUserByPhone('628000')).toBeNull()
    expect(await repo.findUserById('tidak-ada')).toBeNull()
    expect(await repo.findOwnedSession('user-1')).toBeNull()
    expect(await repo.findToken('hash')).toBeNull()
  })

  it('menghitung hanya user role sales', async () => {
    const { db, ops } = createFakeDb([{ count: '3' }])
    const repo = createAuthRepository(db)

    expect(await repo.countSales()).toBe(3)
    expect(ops).toEqual(['select', 'where'])
  })

  it('menyimpan user dan token tanpa mengubah nilainya', async () => {
    const { db, inserted } = createFakeDb()
    const repo = createAuthRepository(db)
    const token = { id: 'token-1', userId: 'user-1', tokenHash: 'hash', expiresAt: new Date() }

    await repo.insertUser(USER)
    await repo.insertToken(token)

    expect(inserted).toEqual([USER, token])
  })

  it('mencabut token per token dan per user', async () => {
    const { db, ops } = createFakeDb()
    const repo = createAuthRepository(db)

    await repo.revokeToken('hash')
    await repo.revokeTokensForUser('user-1')
    await repo.deleteUser('user-1')

    expect(ops).toEqual(['delete', 'delete', 'delete'])
  })

  it('mengambil token beserta user lewat join', async () => {
    const expiresAt = new Date('2026-12-01T00:00:00.000Z')
    const { db, ops } = createFakeDb([{ tokenHash: 'hash', expiresAt, user: USER }])
    const repo = createAuthRepository(db)

    expect(await repo.findToken('hash')).toEqual({ tokenHash: 'hash', expiresAt, user: USER })
    expect(ops).toContain('join')
  })

  it('mengambil sesi milik user', async () => {
    const session = { id: 'session-1', ownerUserId: 'user-1' }
    const repo = createAuthRepository(createFakeDb([session]).db)

    expect(await repo.findOwnedSession('user-1')).toEqual(session)
  })
})
