import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WaSessionRow } from '../db/schema.js'

const state = vi.hoisted(() => {
  const handlers: Record<string, (arg: unknown) => void> = {}
  const socket = {
    ev: {
      on: (event: string, handler: (arg: unknown) => void) => {
        handlers[event] = handler
      },
    },
    end: vi.fn(),
    sendMessage: vi.fn(),
  }
  const auth = {
    state: { creds: { registered: true }, keys: {} },
    saveCreds: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  }
  const lock = {
    release: vi.fn(async () => true),
    startRenewal: vi.fn((_onLost?: () => void) => () => undefined),
  }
  return {
    handlers,
    socket,
    auth,
    lock,
    acquire: vi.fn(async () => lock as unknown),
    createSocket: vi.fn(() => socket),
  }
})

vi.mock('../infra/lock.js', () => ({ SessionLock: { acquire: state.acquire } }))
vi.mock('../baileys/auth-store.js', () => ({
  useDbAuthState: vi.fn(async () => state.auth),
}))
vi.mock('../baileys/socket.js', () => ({ createSocket: state.createSocket }))

const { SessionManager } = await import('./session-manager.js')

const SESSION: WaSessionRow = {
  id: 's1',
  publicId: 's1',
  label: 'Sesi',
  phoneNumber: null,
  status: 'disconnected',
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

function createManager() {
  const sessions = {
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => SESSION),
  }
  const messages = { applyStatusUpdate: vi.fn(async () => true) }
  const manager = new SessionManager({
    db: {} as never,
    redis: { get: vi.fn(async () => null) } as never,
    cipher: {} as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
    browserName: 'test',
    lockTtlMs: 30_000,
    sessions: sessions as never,
    messages: messages as never,
  })
  return { manager, sessions, messages }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.acquire.mockResolvedValue(state.lock as never)
  })

  it('manager kedua ditolak lock dan tidak membuat socket', async () => {
    state.acquire.mockResolvedValueOnce(state.lock as never).mockResolvedValueOnce(null)
    const first = createManager()
    const second = createManager()

    await first.manager.start(SESSION)
    await second.manager.start(SESSION)

    expect(state.acquire).toHaveBeenCalledTimes(2)
    expect(state.createSocket).toHaveBeenCalledTimes(1)
    expect(first.manager.has('s1')).toBe(true)
    expect(second.manager.has('s1')).toBe(false)
  })

  it('401 menghapus auth state dan menandai logged_out', async () => {
    const { manager, sessions } = createManager()
    await manager.start(SESSION)

    state.handlers['connection.update']?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 401 } } },
    })

    await vi.waitFor(() => expect(state.auth.clear).toHaveBeenCalledOnce())
    expect(state.socket.end).toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith('s1', { status: 'logged_out' }),
    )
    expect(manager.has('s1')).toBe(false)
  })

  it('lock hilang menghentikan socket', async () => {
    const { manager } = createManager()
    await manager.start(SESSION)

    const onLost = state.lock.startRenewal.mock.calls[0]?.[0] as (() => void) | undefined
    expect(onLost).toBeTypeOf('function')
    onLost?.()

    await vi.waitFor(() => expect(state.socket.end).toHaveBeenCalled())
    expect(manager.has('s1')).toBe(false)
  })

  it('pairing code diminta dari event qr', async () => {
    state.auth.state.creds.registered = false
    const { manager, sessions } = createManager()
    const redis = {
      get: vi.fn(async () => '628123456789'),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    }
    ;(manager as unknown as { deps: { redis: unknown } }).deps.redis = redis
    const requestPairingCode = vi.fn(async () => 'ABCD-1234')
    state.createSocket.mockReturnValueOnce({
      ...state.socket,
      requestPairingCode,
    } as never)

    await manager.start(SESSION)
    state.handlers['connection.update']?.({ qr: 'qr-string' })

    await vi.waitFor(() => expect(requestPairingCode).toHaveBeenCalledWith('628123456789'))
    expect(redis.set).toHaveBeenCalledWith(
      'wa:pairing:code:s1',
      'ABCD-1234',
      'EX',
      600,
    )
    expect(redis.del).toHaveBeenCalledWith('wa:pairing:request:s1')
    expect(sessions.update).toHaveBeenCalledWith('s1', {
      phoneNumber: '628123456789',
      status: 'connecting',
    })
    state.auth.state.creds.registered = true
  })

  it('pairing tidak diminta saat creds sudah registered', async () => {
    state.auth.state.creds.registered = true
    const { manager } = createManager()
    const redis = {
      get: vi.fn(async () => '628123456789'),
      set: vi.fn(async () => 'OK'),
      del: vi.fn(async () => 1),
    }
    ;(manager as unknown as { deps: { redis: unknown } }).deps.redis = redis
    const requestPairingCode = vi.fn(async () => 'ABCD-1234')
    state.createSocket.mockReturnValueOnce({
      ...state.socket,
      requestPairingCode,
    } as never)

    await manager.start(SESSION)
    state.handlers['connection.update']?.({ qr: 'qr-string' })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(requestPairingCode).not.toHaveBeenCalled()
  })
})
