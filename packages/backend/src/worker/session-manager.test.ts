import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DisconnectReason } from '@whiskeysockets/baileys'

import type { WaSessionRow } from '../db/schema.js'
import { SendTimeoutError, SessionNotReadyError } from '../modules/errors.js'

const state = vi.hoisted(() => {
  const handlers: Record<string, (arg: unknown) => void> = {}
  const socket = {
    ev: {
      on: (event: string, handler: (arg: unknown) => void) => {
        handlers[event] = handler
      },
    },
    ws: { isOpen: false },
    end: vi.fn(),
    logout: vi.fn(async () => undefined),
    sendMessage: vi.fn(),
  }
  const auth = {
    state: {
      creds: { registered: true as boolean, me: undefined as { id: string } | undefined },
      keys: {},
    },
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
  engine: 'baileys',
  phoneNumber: null,
  status: 'disconnected',
  lastQr: null,
  lastConnectedAt: null,
  tokenHash: null,
  tokenRotatedAt: null,
  salesId: null,
  agentId: null,
  ownerUserId: null,
  dailySendLimit: 200,
  authFormat: 'v7',
  pairingMethod: 'qr',
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createManager() {
  const sessions = {
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => SESSION),
    markDisconnectedIfLive: vi.fn(async () => true),
  }
  const messages = { applyStatusUpdate: vi.fn(async () => null) }
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const manager = new SessionManager({
    db: {} as never,
    redis: {
      get: vi.fn(async () => null),
      del: vi.fn(async () => 1),
      publish: vi.fn(async () => 1),
    } as never,
    cipher: {} as never,
    logger: logger as never,
    browserName: 'test',
    lockTtlMs: 30_000,
    sessions: sessions as never,
    messages: messages as never,
    optOuts: { recordKeyword: vi.fn(async () => false) } as never,
    webhooks: { record: vi.fn(async () => 0) } as never,
  })
  return { manager, sessions, messages, logger }
}

describe('SessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.acquire.mockResolvedValue(state.lock as never)
    state.auth.state.creds.registered = false
    state.auth.state.creds.me = { id: '628123456789:12@s.whatsapp.net' }
    state.socket.ws.isOpen = false
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
      expect(sessions.update).toHaveBeenCalledWith('s1', {
        status: 'logged_out',
        lastQr: null,
      }),
    )
    expect(manager.has('s1')).toBe(false)
  })

  it('403 nomor diblokir menghapus auth state dan menandai logged_out', async () => {
    const { manager, sessions, logger } = createManager()
    await manager.start(SESSION)

    state.handlers['connection.update']?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: DisconnectReason.forbidden } } },
    })

    await vi.waitFor(() => expect(state.auth.clear).toHaveBeenCalledOnce())
    expect(state.socket.end).toHaveBeenCalled()
    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith('s1', {
        status: 'logged_out',
        lastQr: null,
      }),
    )
    expect(manager.has('s1')).toBe(false)
    expect(logger.warn).toHaveBeenCalled()
    expect(
      (manager as unknown as { reconnectAttempts: Map<string, number> }).reconnectAttempts.size,
    ).toBe(0)
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
    state.auth.state.creds.me = undefined
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
    expect(redis.set).toHaveBeenCalledWith('wa:pairing:code:s1', 'ABCD-1234', 'EX', 600)
    expect(redis.del).toHaveBeenCalledWith('wa:pairing:request:s1')
    expect(sessions.update).toHaveBeenCalledWith('s1', {
      phoneNumber: '628123456789',
      status: 'connecting',
    })
  })

  it('pairing tidak diminta saat sesi sudah paired via QR (registered false)', async () => {
    state.auth.state.creds.registered = false
    state.auth.state.creds.me = { id: '628123456789:12@s.whatsapp.net' }
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

  it('koneksi tutup pada sesi belum pairing: tidak reconnect dan QR dibuang', async () => {
    state.auth.state.creds.registered = false
    state.auth.state.creds.me = undefined
    const { manager, sessions } = createManager()
    await manager.start(SESSION)

    state.handlers['connection.update']?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 428 } } },
    })

    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith('s1', {
        status: 'disconnected',
        lastQr: null,
      }),
    )
    expect(manager.has('s1')).toBe(false)
    expect(
      (manager as unknown as { reconnectAttempts: Map<string, number> }).reconnectAttempts.size,
    ).toBe(0)
  })

  it('koneksi tutup pada sesi paired via QR (registered false) di-reconnect otomatis', async () => {
    state.auth.state.creds.registered = false
    state.auth.state.creds.me = { id: '628123456789:12@s.whatsapp.net' }
    const { manager, sessions } = createManager()
    await manager.start(SESSION)

    state.handlers['connection.update']?.({
      connection: 'close',
      lastDisconnect: { error: { output: { statusCode: 428 } } },
    })

    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith('s1', { status: 'disconnected' }),
    )
    expect(manager.has('s1')).toBe(false)
    expect(
      (manager as unknown as { reconnectAttempts: Map<string, number> }).reconnectAttempts.size,
    ).toBe(1)
  })

  it('stop menandai sesi disconnected sebelum lock dilepas', async () => {
    const { manager, sessions } = createManager()
    await manager.start(SESSION)

    await manager.stop('s1')

    expect(sessions.markDisconnectedIfLive).toHaveBeenCalledWith('s1')
    expect(state.lock.release).toHaveBeenCalled()
    expect(manager.has('s1')).toBe(false)
  })

  it('gagal menandai disconnected tidak menggagalkan stop', async () => {
    const { manager, sessions, logger } = createManager()
    await manager.start(SESSION)
    sessions.markDisconnectedIfLive.mockRejectedValueOnce(new Error('db down'))

    await manager.stop('s1')

    expect(logger.warn).toHaveBeenCalled()
    expect(state.lock.release).toHaveBeenCalled()
    expect(manager.has('s1')).toBe(false)
  })

  it('sendText menolak saat socket tertutup dan menandai sesi disconnected', async () => {
    const { manager, sessions } = createManager()
    await manager.start(SESSION)
    state.socket.ws.isOpen = false

    await expect(manager.sendText('s1', '628123456789@s.whatsapp.net', 'halo')).rejects.toBeInstanceOf(
      SessionNotReadyError,
    )
    expect(sessions.markDisconnectedIfLive).toHaveBeenCalledWith('s1')
    expect(state.socket.sendMessage).not.toHaveBeenCalled()
  })

  it('sendText menolak saat handle tidak ada tanpa mengubah status', async () => {
    const { manager, sessions } = createManager()

    await expect(manager.sendText('sX', 'abc@s.whatsapp.net', 'halo')).rejects.toBeInstanceOf(
      SessionNotReadyError,
    )
    expect(sessions.markDisconnectedIfLive).not.toHaveBeenCalled()
  })

  it('sendText mengirim langsung ke JID tujuan', async () => {
    const { manager } = createManager()
    await manager.start(SESSION)
    state.socket.ws.isOpen = true
    state.socket.sendMessage.mockResolvedValueOnce({ key: { id: 'wa-1' } })

    await expect(
      manager.sendText('s1', '628123456789@s.whatsapp.net', 'halo'),
    ).resolves.toEqual({ key: { id: 'wa-1' } })
    expect(state.socket.sendMessage).toHaveBeenCalledWith('628123456789@s.whatsapp.net', {
      text: 'halo',
    })
  })

  it('sendText timeout saat socket tidak merespons', async () => {
    vi.useFakeTimers()
    try {
      const { manager } = createManager()
      await manager.start(SESSION)
      state.socket.ws.isOpen = true
      state.socket.sendMessage.mockImplementationOnce(() => new Promise(() => undefined))

      const promise = manager.sendText('s1', '628123456789@s.whatsapp.net', 'halo')
      const assertion = expect(promise).rejects.toBeInstanceOf(SendTimeoutError)
      await vi.advanceTimersByTimeAsync(20_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('logout melepas perangkat di WhatsApp dan membersihkan auth', async () => {
    const { manager, sessions } = createManager()
    await manager.start(SESSION)
    state.socket.ws.isOpen = true

    await manager.stop('s1', true)

    expect(state.socket.logout).toHaveBeenCalled()
    expect(state.auth.clear).toHaveBeenCalled()
    expect(sessions.update).not.toHaveBeenCalled()
  })

  it('515 restartRequired menyambung ulang tanpa menandai sesi terputus', async () => {
    const { manager, sessions } = createManager()
    await manager.start(SESSION)

    state.handlers['connection.update']?.({
      connection: 'close',
      lastDisconnect: {
        error: { output: { statusCode: DisconnectReason.restartRequired } },
      },
    })

    await vi.waitFor(() => expect(state.createSocket).toHaveBeenCalledTimes(2))
    expect(manager.has('s1')).toBe(true)
    expect(sessions.update).toHaveBeenCalledWith('s1', { status: 'connecting' })
    expect(sessions.update).not.toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ status: 'disconnected' }),
    )
  })

  it('event open mengisi phone_number dari creds', async () => {
    const { manager, sessions } = createManager()
    state.auth.state.creds.me = { id: '628123456789:12@s.whatsapp.net' }
    await manager.start(SESSION)

    state.handlers['connection.update']?.({ connection: 'open' })

    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith('s1', { phoneNumber: '628123456789' }),
    )
  })

  it('event open tidak menimpa phone_number yang sudah ada', async () => {
    const { manager, sessions } = createManager()
    state.auth.state.creds.me = { id: '628999999999@s.whatsapp.net' }
    sessions.findById.mockResolvedValueOnce({ ...SESSION, phoneNumber: '628111111111' })
    await manager.start(SESSION)

    state.handlers['connection.update']?.({ connection: 'open' })

    await vi.waitFor(() =>
      expect(sessions.update).toHaveBeenCalledWith(
        's1',
        expect.objectContaining({ status: 'connected' }),
      ),
    )
    expect(sessions.update).not.toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ phoneNumber: expect.any(String) }),
    )
  })

  it('gagal menyimpan nomor tidak menggagalkan koneksi', async () => {
    const { manager, sessions, logger } = createManager()
    state.auth.state.creds.me = { id: '628123456789@s.whatsapp.net' }
    sessions.update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('duplicate'))
    await manager.start(SESSION)

    state.handlers['connection.update']?.({ connection: 'open' })

    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledOnce())
    expect(sessions.update).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ status: 'connected' }),
    )
  })
})
