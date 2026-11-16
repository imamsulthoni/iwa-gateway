import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'

const state = vi.hoisted(() => ({
  getAuthPresence: vi.fn(),
  deleteAuthState: vi.fn(async () => undefined),
  hasAuthState: vi.fn(async () => false),
  isAuthRegistered: vi.fn(async () => true),
  dbRef: {} as never,
}))

vi.mock('../baileys/auth-store.js', () => ({
  getAuthPresence: state.getAuthPresence,
  deleteAuthState: state.deleteAuthState,
  hasAuthState: state.hasAuthState,
  isAuthRegistered: state.isAuthRegistered,
}))

const { bootstrapSessions } = await import('./bootstrap.js')

const ROW: WaSessionRow = {
  id: 's1',
  publicId: 's1',
  label: 'Sesi',
  engine: 'baileys',
  phoneNumber: null,
  status: 'connected',
  lastQr: null,
  lastConnectedAt: null,
  tokenHash: null,
  tokenRotatedAt: null,
  salesId: null,
  agentId: null,
  dailySendLimit: 200,
  authFormat: 'v7',
  pairingMethod: 'qr',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createDeps() {
  const sessions = {
    startable: vi.fn(async () => [ROW]),
    listByStatus: vi.fn(async (): Promise<WaSessionRow[]> => []),
    updateStatus: vi.fn(async () => undefined),
  }
  const manager = { start: vi.fn(async () => undefined) }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const deps = { db: state.dbRef, cipher: {}, sessions, manager, logger } as never
  return { deps, sessions, manager, logger }
}

describe('bootstrapSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isAuthRegistered.mockResolvedValue(true)
  })

  it('memulai sesi dengan auth lengkap dan konsisten', async () => {
    state.getAuthPresence.mockResolvedValue({ creds: true, keys: true })
    const { deps, manager } = createDeps()

    const started = await bootstrapSessions(deps)

    expect(started).toBe(1)
    expect(manager.start).toHaveBeenCalledWith(ROW)
  })

  it('menolak sesi creds tanpa keys: logged_out, auth dihapus, tidak connect', async () => {
    state.getAuthPresence.mockResolvedValue({ creds: true, keys: false })
    const { deps, manager, sessions, logger } = createDeps()

    const started = await bootstrapSessions(deps)

    expect(started).toBe(0)
    expect(manager.start).not.toHaveBeenCalled()
    expect(state.deleteAuthState).toHaveBeenCalledWith(state.dbRef, 's1')
    expect(sessions.updateStatus).toHaveBeenCalledWith('s1', 'logged_out')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('menolak sesi keys tanpa creds', async () => {
    state.getAuthPresence.mockResolvedValue({ creds: false, keys: true })
    const { deps, manager, sessions } = createDeps()

    const started = await bootstrapSessions(deps)

    expect(started).toBe(0)
    expect(manager.start).not.toHaveBeenCalled()
    expect(state.deleteAuthState).toHaveBeenCalledWith(state.dbRef, 's1')
    expect(sessions.updateStatus).toHaveBeenCalledWith('s1', 'logged_out')
  })

  it('melewati sesi tanpa auth sama sekali', async () => {
    state.getAuthPresence.mockResolvedValue({ creds: false, keys: false })
    const { deps, manager, sessions } = createDeps()

    const started = await bootstrapSessions(deps)

    expect(started).toBe(0)
    expect(manager.start).not.toHaveBeenCalled()
    expect(state.deleteAuthState).not.toHaveBeenCalled()
    expect(sessions.updateStatus).not.toHaveBeenCalled()
  })

  it('melewati sesi dengan auth yang belum pairing', async () => {
    state.getAuthPresence.mockResolvedValue({ creds: true, keys: true })
    state.isAuthRegistered.mockResolvedValue(false)
    const { deps, manager } = createDeps()

    const started = await bootstrapSessions(deps)

    expect(started).toBe(0)
    expect(manager.start).not.toHaveBeenCalled()
    expect(state.isAuthRegistered).toHaveBeenCalledWith(state.dbRef, {}, 's1')
  })

  it('membersihkan auth sesi logged_out yang tertinggal saat worker mati', async () => {
    state.hasAuthState.mockResolvedValue(true)
    const { deps, sessions } = createDeps()
    vi.mocked(sessions.listByStatus).mockResolvedValue([{ ...ROW, id: 's9', status: 'logged_out' }])

    await bootstrapSessions(deps)

    expect(state.deleteAuthState).toHaveBeenCalledWith(state.dbRef, 's9')
  })
})
