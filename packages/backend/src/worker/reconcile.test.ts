import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'

const state = vi.hoisted(() => ({
  hasAuthState: vi.fn(),
  isAuthPaired: vi.fn(),
  useDbAuthState: vi.fn(async () => undefined),
  deleteAuthState: vi.fn(),
}))

vi.mock('../baileys/auth-store.js', () => ({
  hasAuthState: state.hasAuthState,
  isAuthPaired: state.isAuthPaired,
  useDbAuthState: state.useDbAuthState,
  deleteAuthState: state.deleteAuthState,
}))

const { reconcileSessions } = await import('./reconcile.js')

function row(status: WaSessionRow['status'], id = 's1'): WaSessionRow {
  return {
    id,
    publicId: id,
    label: 'Sesi',
    engine: 'baileys',
    phoneNumber: null,
    status,
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
}

function createDeps(rows: WaSessionRow[]) {
  const sessions = {
    startable: vi.fn(async () => rows),
    get: vi.fn(async () => rows[0]),
    listByStatus: vi.fn(async () => [] as WaSessionRow[]),
  }
  const manager = {
    has: vi.fn(() => false),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    activeSessionIds: vi.fn(() => [] as string[]),
  }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const cipher = {}
  const deps = { db: {}, cipher, sessions, manager, logger } as never
  return { deps, sessions, manager, logger }
}

describe('reconcileSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isAuthPaired.mockResolvedValue(true)
  })

  it('sesi baru created tanpa auth di-start dan auth dibuat', async () => {
    const { deps, manager } = createDeps([row('created')])
    state.hasAuthState.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(state.useDbAuthState).toHaveBeenCalledOnce()
    expect(manager.start).toHaveBeenCalledOnce()
  })

  it('sesi connecting tanpa auth di-start (login manual)', async () => {
    const { deps, manager } = createDeps([row('connecting')])
    state.hasAuthState.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(state.useDbAuthState).toHaveBeenCalledOnce()
    expect(manager.start).toHaveBeenCalledOnce()
  })

  it('sesi disconnected tanpa auth dilewati', async () => {
    const { deps, manager } = createDeps([row('disconnected')])
    state.hasAuthState.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(state.useDbAuthState).not.toHaveBeenCalled()
    expect(manager.start).not.toHaveBeenCalled()
  })

  it('sesi dengan auth yang belum pairing tidak di-start ulang (anti 429)', async () => {
    const { deps, manager } = createDeps([row('qr_pending')])
    state.hasAuthState.mockResolvedValue(true)
    state.isAuthPaired.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(manager.start).not.toHaveBeenCalled()
    expect(state.isAuthPaired).toHaveBeenCalledOnce()
  })

  it('sesi dengan auth yang sudah pairing di-start ulang', async () => {
    const { deps, manager } = createDeps([row('disconnected')])
    state.hasAuthState.mockResolvedValue(true)
    state.isAuthPaired.mockResolvedValue(true)

    await reconcileSessions(deps)

    expect(manager.start).toHaveBeenCalledOnce()
  })

  it('sesi aktif yang tidak lagi startable dihentikan', async () => {
    const rows = [row('logged_out')]
    const sessions = {
      startable: vi.fn(async () => rows),
      get: vi.fn(async () => rows[0]),
      listByStatus: vi.fn(async () => rows),
    }
    const manager = {
      has: vi.fn(() => false),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      activeSessionIds: vi.fn(() => ['s1']),
    }
    const deps = {
      db: {},
      cipher: {},
      sessions,
      manager,
      logger: { info: vi.fn(), warn: vi.fn() },
    } as never

    await reconcileSessions(deps)

    expect(manager.stop).toHaveBeenCalledWith('s1', true)
  })

  it('auth sesi logged_out yang tertinggal dibersihkan', async () => {
    const { deps, sessions } = createDeps([])
    sessions.listByStatus.mockResolvedValueOnce([row('logged_out')])
    state.hasAuthState.mockResolvedValue(true)

    await reconcileSessions(deps)

    expect(state.deleteAuthState).toHaveBeenCalledWith(expect.anything(), 's1')
  })

  it('sesi logged_out tanpa auth tidak dihapus ulang', async () => {
    const { deps, sessions } = createDeps([])
    sessions.listByStatus.mockResolvedValueOnce([row('logged_out')])
    state.hasAuthState.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(state.deleteAuthState).not.toHaveBeenCalled()
  })

  it('gagal menghapus auth logged_out dicatat dan tidak menggagalkan reconcile', async () => {
    const { deps, sessions, logger } = createDeps([])
    sessions.listByStatus.mockResolvedValueOnce([row('logged_out')])
    state.hasAuthState.mockResolvedValue(true)
    state.deleteAuthState.mockRejectedValueOnce(new Error('db down'))

    await reconcileSessions(deps)

    expect(logger.warn).toHaveBeenCalledOnce()
  })
})
