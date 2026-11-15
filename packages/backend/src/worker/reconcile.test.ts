import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'

const state = vi.hoisted(() => ({
  hasAuthState: vi.fn(),
  isAuthRegistered: vi.fn(),
  useDbAuthState: vi.fn(async () => undefined),
}))

vi.mock('../baileys/auth-store.js', () => ({
  hasAuthState: state.hasAuthState,
  isAuthRegistered: state.isAuthRegistered,
  useDbAuthState: state.useDbAuthState,
}))

const { reconcileSessions } = await import('./reconcile.js')

function row(status: WaSessionRow['status'], id = 's1'): WaSessionRow {
  return {
    id,
    publicId: id,
    label: 'Sesi',
    phoneNumber: null,
    status,
    lastQr: null,
    lastConnectedAt: null,
    tokenHash: null,
    tokenRotatedAt: null,
    salesId: null,
    agentId: null,
    dailySendLimit: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function createDeps(rows: WaSessionRow[]) {
  const sessions = {
    startable: vi.fn(async () => rows),
    get: vi.fn(async () => rows[0]),
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
  return { deps, sessions, manager }
}

describe('reconcileSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.isAuthRegistered.mockResolvedValue(true)
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
    state.isAuthRegistered.mockResolvedValue(false)

    await reconcileSessions(deps)

    expect(manager.start).not.toHaveBeenCalled()
    expect(state.isAuthRegistered).toHaveBeenCalledOnce()
  })

  it('sesi dengan auth yang sudah registered di-start ulang', async () => {
    const { deps, manager } = createDeps([row('disconnected')])
    state.hasAuthState.mockResolvedValue(true)
    state.isAuthRegistered.mockResolvedValue(true)

    await reconcileSessions(deps)

    expect(manager.start).toHaveBeenCalledOnce()
  })

  it('sesi aktif yang tidak lagi startable dihentikan', async () => {
    const rows = [row('logged_out')]
    const sessions = {
      startable: vi.fn(async () => rows),
      get: vi.fn(async () => rows[0]),
    }
    const manager = {
      has: vi.fn(() => false),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      activeSessionIds: vi.fn(() => ['s1']),
    }
    const deps = { db: {}, cipher: {}, sessions, manager, logger: { info: vi.fn() } } as never

    await reconcileSessions(deps)

    expect(manager.stop).toHaveBeenCalledWith('s1', true)
  })
})
