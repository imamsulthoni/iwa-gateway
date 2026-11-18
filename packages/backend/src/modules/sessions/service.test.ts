import { describe, expect, it } from 'vitest'

import type { WaSessionRow } from '../../db/schema.js'
import { ConflictError, NotFoundError } from '../errors.js'
import { hashSessionToken, verifySessionToken } from '../auth/session-token.js'
import type { SessionsRepository } from './repository.js'
import { createSessionsService } from './service.js'

function createMemoryRepository(): SessionsRepository {
  const rows = new Map<string, WaSessionRow>()

  const repo: SessionsRepository = {
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
        dailySendLimit: values.dailySendLimit ?? 200,
        authFormat: 'v7',
        pairingMethod: 'qr',
        createdAt: now,
        updatedAt: now,
      })
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
      rows.set(id, { ...row, ...values, updatedAt: new Date() })
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

describe('sessions service', () => {
  it('membuat sesi dan menyimpan hash token', async () => {
    const service = createSessionsService(createMemoryRepository())
    const { session, token } = await service.create({ label: 'Sales A', publicId: 'sales-a' })

    expect(session.publicId).toBe('sales-a')
    expect(session.status).toBe('created')
    expect(session.tokenHash).toBe(hashSessionToken(token))
    expect(verifySessionToken(token, session.tokenHash ?? '')).toBe(true)
  })

  it('menolak public_id tidak valid dan duplikat', async () => {
    const service = createSessionsService(createMemoryRepository())
    await expect(service.create({ label: 'A', publicId: 'tidak valid' })).rejects.toThrow()
    await service.create({ label: 'A', publicId: 'sama' })
    await expect(service.create({ label: 'B', publicId: 'sama' })).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('menolak nomor duplikat', async () => {
    const service = createSessionsService(createMemoryRepository())
    await service.create({ label: 'A', publicId: 'a', phoneNumber: '628123456789' })
    await expect(
      service.create({ label: 'B', publicId: 'b', phoneNumber: '628123456789' }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('rotasi token membuat token lama gagal', async () => {
    const service = createSessionsService(createMemoryRepository())
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
    const service = createSessionsService(repo)

    expect((await service.list(50, 'user-1')).map((row) => row.publicId)).toEqual(['a'])
    expect((await service.list(50, 'user-2')).map((row) => row.publicId)).toEqual(['b'])
    expect(await service.list(50)).toHaveLength(2)
  })

  it('mengubah status dan menghapus sesi', async () => {
    const service = createSessionsService(createMemoryRepository())
    const { session } = await service.create({ label: 'A', publicId: 'a' })

    expect((await service.updateStatus(session.id, 'connecting')).status).toBe('connecting')
    await service.remove(session.id)
    await expect(service.get(session.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})
