import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { hashPin } from '../../src/modules/auth/pin.js'
import { createAuthRepository } from '../../src/modules/auth/repository.js'
import { createAuthService } from '../../src/modules/auth/service.js'
import { users, waSessions } from '../../src/db/schema.js'
import { ConflictError, SalesLimitReachedError } from '../../src/modules/errors.js'
import { createSessionsRepository } from '../../src/modules/sessions/repository.js'
import { createSessionsService } from '../../src/modules/sessions/service.js'
import { createSettingsRepository } from '../../src/modules/settings/repository.js'
import { createSettingsService } from '../../src/modules/settings/service.js'
import { newId } from '../../src/db/id.js'
import { RUN_INTEGRATION, resetTestDb, setupTestDb } from './setup.js'

const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

describeIntegration('siklus hidup sesi + akun sales', () => {
  let connection: Awaited<ReturnType<typeof setupTestDb>>

  beforeAll(async () => {
    connection = await setupTestDb()
  })

  afterAll(async () => {
    await connection.pool.end()
  })

  beforeEach(async () => {
    await resetTestDb(connection.pool)
  })

  function createServices() {
    const settings = createSettingsService(createSettingsRepository(connection.db))
    return {
      settings,
      sessions: createSessionsService(createSessionsRepository(connection.db), settings),
      auth: createAuthService(createAuthRepository(connection.db)),
    }
  }

  it('create sesi sales → login → hapus sesi → login gagal', async () => {
    const { sessions, auth, settings } = createServices()
    const { session } = await sessions.create({
      label: 'Nomor Budi',
      salesName: 'Budi',
      phoneNumber: '628123456789',
      pin: '123456',
    })

    expect(session.salesName).toBe('Budi')
    const login = await auth.login('628123456789', '123456')
    expect(login.user.id).toBe(session.ownerUserId)
    expect(await settings.getSettings()).toMatchObject({ salesCount: 1 })

    await sessions.remove(session.id)

    await expect(auth.login('628123456789', '123456')).rejects.toThrow('Nomor atau PIN salah')
    expect(await auth.authenticate(login.token)).toBeNull()
    expect(await settings.getSettings()).toMatchObject({ salesCount: 0 })
  })

  it('menolak create saat kuota sales penuh', async () => {
    const { sessions, settings } = createServices()
    await settings.updateSettings({ maxSales: 1 })
    await sessions.create({
      label: 'Nomor A',
      salesName: 'Sales A',
      phoneNumber: '628123456789',
      pin: '123456',
    })

    await expect(
      sessions.create({
        label: 'Nomor B',
        salesName: 'Sales B',
        phoneNumber: '628987654321',
        pin: '654321',
      }),
    ).rejects.toBeInstanceOf(SalesLimitReachedError)
    expect(await settings.getSettings()).toMatchObject({ salesCount: 1 })
  })

  it('menolak nomor duplikat tanpa meninggalkan sesi yatim', async () => {
    const { sessions } = createServices()
    await sessions.create({
      label: 'Nomor A',
      salesName: 'Sales A',
      phoneNumber: '628123456789',
      pin: '123456',
    })

    await expect(
      sessions.create({
        label: 'Nomor B',
        salesName: 'Sales B',
        phoneNumber: '628123456789',
        pin: '654321',
      }),
    ).rejects.toBeInstanceOf(ConflictError)

    const rows = await connection.db.select().from(users)
    expect(rows).toHaveLength(1)
  })

  it('rollback transaksi saat insert user gagal karena nomor sudah dipakai', async () => {
    const { sessions } = createServices()
    await connection.db.insert(users).values({
      id: newId(),
      name: 'Sales Lama',
      phoneNumber: '628111111111',
      role: 'sales',
      pinHash: hashPin('123456'),
    })

    await expect(
      sessions.create({
        label: 'Nomor Baru',
        salesName: 'Sales Baru',
        phoneNumber: '628111111111',
        pin: '654321',
      }),
    ).rejects.toBeInstanceOf(ConflictError)

    expect(await connection.db.select().from(users)).toHaveLength(1)
    expect(await connection.db.select().from(waSessions)).toHaveLength(0)
  })
})