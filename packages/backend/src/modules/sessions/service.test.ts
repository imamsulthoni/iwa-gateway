import { describe, expect, it } from 'vitest'

import type { UserRow } from '../../db/schema.js'
import { ConflictError, NotFoundError, SalesLimitReachedError, ValidationError } from '../errors.js'
import { hashSessionToken, verifySessionToken } from '../auth/session-token.js'
import { verifyPin } from '../auth/pin.js'
import type { SessionsRepository, SessionWithOwner } from './repository.js'
import { createSessionsService, toSessionDto } from './service.js'

type MemoryRepository = SessionsRepository & {
  users: Map<string, UserRow>
  revokedUserIds: string[]
}

function createMemoryRepository(): MemoryRepository {
  const rows = new Map<string, SessionWithOwner>()
  const users = new Map<string, UserRow>()
  const revokedUserIds: string[] = []

  const repo: MemoryRepository = {
    users,
    revokedUserIds,
    async insert(values) {
      const now = new Date()
      rows.set(values.id, {
        id: values.id,
        publicId: values.publicId,
        label: values.label,
        engine: 'baileys',
        phoneNumber: values.phoneNumber ?? null,
        status: values.status ?? 'created',
        lastQr: null,
        lastConnectedAt: null,
        tokenHash: values.tokenHash ?? null,
        tokenRotatedAt: null,
        salesId: values.salesId ?? null,
        agentId: values.agentId ?? null,
        ownerUserId: values.ownerUserId ?? null,
        salesName: null,
        dailySendLimit: values.dailySendLimit ?? 200,
        authFormat: 'v7',
        pairingMethod: 'qr',
        createdAt: now,
        updatedAt: now,
      })
    },
    async insertWithOwner(user, session) {
      const now = new Date()
      users.set(user.id, {
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role ?? 'sales',
        pinHash: user.pinHash,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      await repo.insert({ ...session, ownerUserId: user.id })
      const row = rows.get(session.id)
      if (row) rows.set(session.id, { ...row, salesName: user.name })
    },
    async deleteUser(id) {
      users.delete(id)
      // User disimpan terpisah di DB nyata; service selalu menghapus sesi lebih dulu.
    },
    async findUserByPhone(phoneNumber) {
      return [...users.values()].find((user) => user.phoneNumber === phoneNumber) ?? null
    },
    async findOwnedSession(userId) {
      return [...rows.values()].find((row) => row.ownerUserId === userId) ?? null
    },
    async updateUser(id, values) {
      const user = users.get(id)
      if (user) users.set(id, { ...user, ...values, updatedAt: new Date() })
    },
    async revokeUserTokens(userId) {
      revokedUserIds.push(userId)
    },
    async insertOwner(user, sessionId) {
      const now = new Date()
      users.set(user.id, {
        id: user.id,
        name: user.name,
        phoneNumber: user.phoneNumber,
        role: user.role ?? 'sales',
        pinHash: user.pinHash,
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      const row = rows.get(sessionId)
      if (row) rows.set(sessionId, { ...row, ownerUserId: user.id, salesName: user.name })
    },
    async findById(id) {
      return rows.get(id) ?? null
    },
    async findByPublicId(publicId) {
      return [...rows.values()].find((row) => row.publicId === publicId) ?? null
    },
    async findByPhone(phoneNumber) {
      return [...rows.values()].find((row) => row.phoneNumber === phoneNumber) ?? null
    },
    async list(limit = 50, ownerUserId?: string) {
      return [...rows.values()]
        .filter((row) => ownerUserId === undefined || row.ownerUserId === ownerUserId)
        .slice(0, limit)
    },
    async update(id, values) {
      const row = rows.get(id)
      if (!row) return
      const salesName =
        'ownerUserId' in values
          ? (users.get(values.ownerUserId ?? '')?.name ?? null)
          : row.salesName
      rows.set(id, { ...row, ...values, salesName, updatedAt: new Date() })
    },
    async remove(id) {
      rows.delete(id)
    },
    async countByStatus(status) {
      return [...rows.values()].filter((row) => row.status === status).length
    },
    async listStartable() {
      return [...rows.values()]
    },
    async listByStatus(status) {
      return [...rows.values()].filter((row) => row.status === status)
    },
    async markDisconnectedIfLive(id) {
      const row = rows.get(id)
      if (!row || (row.status !== 'connected' && row.status !== 'connecting')) return false
      rows.set(id, { ...row, status: 'disconnected', updatedAt: new Date() })
      return true
    },
  }

  return repo
}

function createService(
  repo = createMemoryRepository(),
  settings: { maxSales: number; salesCount: number } = { maxSales: 10, salesCount: 0 },
) {
  return createSessionsService(repo, { getSettings: async () => settings })
}

describe('sessions service', () => {
  it('membuat sesi dan menyimpan hash token', async () => {
    const service = createService()
    const { session, token } = await service.create({ label: 'Sales A', publicId: 'sales-a' })

    expect(session.publicId).toBe('sales-a')
    expect(session.status).toBe('created')
    expect(session.tokenHash).toBe(hashSessionToken(token))
    expect(verifySessionToken(token, session.tokenHash ?? '')).toBe(true)
  })

  it('membuat akun sales dan menyimpan PIN sebagai hash', async () => {
    const repo = createMemoryRepository()
    const service = createService(repo)
    const { session } = await service.create({
      label: 'Sales A',
      salesName: 'Budi',
      phoneNumber: '628123456789',
      pin: '123456',
    })

    expect(session.salesName).toBe('Budi')
    expect(session.ownerUserId).not.toBeNull()
  })

  it('menolak pembuatan akun sales saat kuota penuh', async () => {
    const service = createService(createMemoryRepository(), { maxSales: 1, salesCount: 1 })
    await expect(
      service.create({
        label: 'Sales B',
        salesName: 'Budi',
        phoneNumber: '628123456789',
        pin: '123456',
      }),
    ).rejects.toBeInstanceOf(SalesLimitReachedError)
  })

  it('menolak nama sales atau PIN yang tidak berpasangan', async () => {
    const service = createService()
    await expect(
      service.create({ label: 'A', salesName: 'Budi', phoneNumber: '628123456789' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('menolak public_id tidak valid dan duplikat', async () => {
    const service = createService()
    await expect(service.create({ label: 'A', publicId: 'tidak valid' })).rejects.toThrow()
    await service.create({ label: 'A', publicId: 'sama' })
    await expect(service.create({ label: 'B', publicId: 'sama' })).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('menolak nomor duplikat', async () => {
    const service = createService()
    await service.create({ label: 'A', publicId: 'a', phoneNumber: '628123456789' })
    await expect(
      service.create({ label: 'B', publicId: 'b', phoneNumber: '628123456789' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('rotasi token membuat token lama gagal', async () => {
    const service = createService()
    const created = await service.create({ label: 'A', publicId: 'a' })
    const rotated = await service.rotateToken(created.session.id)

    expect(rotated.token).not.toBe(created.token)
    expect(verifySessionToken(created.token, rotated.session.tokenHash ?? '')).toBe(false)
    expect(verifySessionToken(rotated.token, rotated.session.tokenHash ?? '')).toBe(true)
    expect(rotated.session.tokenRotatedAt).not.toBeNull()
  })

  it('memfilter daftar sesi berdasarkan owner sales', async () => {
    const repo = createMemoryRepository()
    await repo.insert({ id: '1', publicId: 'a', label: 'A', ownerUserId: 'user-1' })
    await repo.insert({ id: '2', publicId: 'b', label: 'B', ownerUserId: 'user-2' })
    const service = createService(repo)

    expect((await service.list(50, 'user-1')).map((row) => row.publicId)).toEqual(['a'])
    expect((await service.list(50, 'user-2')).map((row) => row.publicId)).toEqual(['b'])
    expect(await service.list(50)).toHaveLength(2)
  })

  it('memetakan salesName dan fallback null untuk sesi lama', async () => {
    const repo = createMemoryRepository()
    await repo.insert({ id: '1', publicId: 'a', label: 'A', ownerUserId: 'user-1' })
    const row = await repo.findById('1')
    expect(row).not.toBeNull()

    expect(toSessionDto({ ...row!, salesName: 'Sales A' }).salesName).toBe('Sales A')
    expect(toSessionDto(row!).salesName).toBeNull()

    const { salesName: _ignored, ...legacy } = row!
    expect(toSessionDto(legacy).salesName).toBeNull()
  })

  it('mengubah status dan menghapus sesi', async () => {
    const service = createService()
    const { session } = await service.create({ label: 'A', publicId: 'a' })

    expect((await service.updateStatus(session.id, 'connecting')).status).toBe('connecting')
    await service.remove(session.id)
    await expect(service.get(session.id)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('reset PIN mengganti hash dan mencabut token sales', async () => {
    const repo = createMemoryRepository()
    const service = createService(repo)
    const { session } = await service.create({
      label: 'Sales A',
      salesName: 'Budi',
      phoneNumber: '628123456789',
      pin: '123456',
    })
    const userId = session.ownerUserId ?? ''

    expect(verifyPin('123456', repo.users.get(userId)?.pinHash ?? '')).toBe(true)

    await service.resetSalesPin(session.id, '654321')

    expect(verifyPin('654321', repo.users.get(userId)?.pinHash ?? '')).toBe(true)
    expect(verifyPin('123456', repo.users.get(userId)?.pinHash ?? '')).toBe(false)
    expect(repo.revokedUserIds).toContain(userId)
  })

  it('reset PIN menolak sesi tanpa akun sales', async () => {
    const service = createService()
    const { session } = await service.create({ label: 'A', publicId: 'a' })

    await expect(service.resetSalesPin(session.id, '654321')).rejects.toBeInstanceOf(ConflictError)
  })

  it('menautkan sales baru ke sesi lama', async () => {
    const repo = createMemoryRepository()
    const service = createService(repo)
    const { session } = await service.create({
      label: 'Lama',
      publicId: 'lama',
      phoneNumber: '628123456789',
    })

    expect(session.salesName).toBeNull()

    const updated = await service.attachSales(session.id, { salesName: 'Rani', pin: '123456' })

    expect(updated.salesName).toBe('Rani')
    expect(updated.ownerUserId).not.toBeNull()
    expect(verifyPin('123456', repo.users.get(updated.ownerUserId ?? '')?.pinHash ?? '')).toBe(true)
  })

  it('menautkan sales memakai ulang akun dengan nomor yang sama', async () => {
    const repo = createMemoryRepository()
    const service = createService(repo)
    const now = new Date()
    repo.users.set('user-lama', {
      id: 'user-lama',
      name: 'Lama',
      phoneNumber: '628123456789',
      role: 'sales',
      pinHash: 'scrypt$x$y',
      active: true,
      createdAt: now,
      updatedAt: now,
    })
    const { session } = await service.create({
      label: 'Lama',
      publicId: 'lama',
      phoneNumber: '628123456789',
    })

    const updated = await service.attachSales(session.id, { salesName: 'Rani', pin: '654321' })

    expect(updated.ownerUserId).toBe('user-lama')
    expect(updated.salesName).toBe('Rani')
    expect(verifyPin('654321', repo.users.get('user-lama')?.pinHash ?? '')).toBe(true)
    expect(repo.revokedUserIds).toContain('user-lama')
  })

  it('menautkan sales menolak sesi ber-owner, kuota penuh, dan tanpa nomor', async () => {
    const owned = createService()
    const existing = await owned.create({
      label: 'Sales A',
      salesName: 'Budi',
      phoneNumber: '628123456789',
      pin: '123456',
    })

    await expect(
      owned.attachSales(existing.session.id, { salesName: 'Rani', pin: '654321' }),
    ).rejects.toBeInstanceOf(ConflictError)

    const full = createService(createMemoryRepository(), { maxSales: 1, salesCount: 1 })
    const legacy = await full.create({ label: 'Lama', publicId: 'lama', phoneNumber: '628987654321' })
    await expect(
      full.attachSales(legacy.session.id, { salesName: 'Rani', pin: '654321' }),
    ).rejects.toBeInstanceOf(SalesLimitReachedError)

    const noPhone = createService()
    const tanpaNomor = await noPhone.create({ label: 'Tanpa nomor', publicId: 'tanpa-nomor' })
    await expect(
      noPhone.attachSales(tanpaNomor.session.id, { salesName: 'Rani', pin: '654321' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})
