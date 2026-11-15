import { DisconnectReason, type WASocket } from '@whiskeysockets/baileys'
import type { Redis } from 'ioredis'
import QRCode from 'qrcode'

import { useDbAuthState, type DbAuthState } from '../baileys/auth-store.js'
import { createSocket } from '../baileys/socket.js'
import type { Database } from '../db/client.js'
import type { WaSessionRow } from '../db/schema.js'
import type { Cipher } from '../infra/crypto.js'
import { SessionLock } from '../infra/lock.js'
import type { AppLogger } from '../infra/logger.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { SessionsRepository } from '../modules/sessions/repository.js'
import { parseConnectionUpdate, type ConnectionUpdateInput } from './events/connection.js'
import { createCredsHandler } from './events/creds.js'
import { parseMessagesUpdate } from './events/messages-update.js'

type SessionHandle = {
  socket: WASocket
  lock: SessionLock
  auth: DbAuthState
  stopRenewal: () => void
}

export type SessionManagerDeps = {
  db: Database
  redis: Redis
  cipher: Cipher
  logger: AppLogger
  browserName: string
  lockTtlMs: number
  sessions: SessionsRepository
  messages: MessagesService
}

export class SessionManager {
  private readonly handles = new Map<string, SessionHandle>()
  private readonly reconnectAttempts = new Map<string, number>()

  constructor(private readonly deps: SessionManagerDeps) {}

  has(sessionId: string): boolean {
    return this.handles.has(sessionId)
  }

  async start(session: WaSessionRow): Promise<void> {
    if (this.handles.has(session.id)) return

    const lock = await SessionLock.acquire(
      this.deps.redis,
      `wa:lock:${session.id}`,
      this.deps.lockTtlMs,
    )
    if (!lock) {
      this.deps.logger.warn(
        { sessionId: session.id },
        'Lock sesi dipegang proses lain, sesi dilewati',
      )
      return
    }

    const auth = await useDbAuthState(session.id, {
      db: this.deps.db,
      cipher: this.deps.cipher,
      logger: this.deps.logger,
    })
    const socket = createSocket({
      auth: auth.state,
      logger: this.deps.logger,
      browserName: this.deps.browserName,
    })
    const handle: SessionHandle = {
      socket,
      lock,
      auth,
      stopRenewal: lock.startRenewal(),
    }
    this.handles.set(session.id, handle)
    this.wire(session.id, handle)

    await this.maybeRequestPairingCode(session, handle)
    this.deps.logger.info({ sessionId: session.id }, 'Socket sesi dimulai')
  }

  private wire(sessionId: string, handle: SessionHandle): void {
    handle.socket.ev.on('creds.update', createCredsHandler(handle.auth.saveCreds))
    handle.socket.ev.on('connection.update', (update) => {
      void this.onConnectionUpdate(sessionId, handle, update)
    })
    handle.socket.ev.on('messages.update', (updates) => {
      void this.onMessagesUpdate(sessionId, updates)
    })
  }

  private async onConnectionUpdate(
    sessionId: string,
    handle: SessionHandle,
    update: ConnectionUpdateInput,
  ): Promise<void> {
    const event = parseConnectionUpdate(update)
    if (!event) return

    if (event.kind === 'qr') {
      const dataUrl = await QRCode.toDataURL(event.qr)
      await this.deps.sessions.update(sessionId, { status: 'qr_pending', lastQr: dataUrl })
      return
    }

    if (event.kind === 'open') {
      this.reconnectAttempts.delete(sessionId)
      await this.deps.sessions.update(sessionId, {
        status: 'connected',
        lastQr: null,
        lastConnectedAt: new Date(),
      })
      return
    }

    if (event.loggedOut) {
      await this.stop(sessionId, true)
      await this.deps.sessions.update(sessionId, { status: 'logged_out' })
      return
    }

    await this.stop(sessionId, false)
    await this.deps.sessions.update(sessionId, { status: 'disconnected' })
    this.scheduleReconnect(sessionId)
    void handle
  }

  private scheduleReconnect(sessionId: string): void {
    const attempt = (this.reconnectAttempts.get(sessionId) ?? 0) + 1
    this.reconnectAttempts.set(sessionId, attempt)
    const delayMs = Math.min(30_000, 2 ** attempt * 1000)
    const timer = setTimeout(() => {
      void this.reconnect(sessionId)
    }, delayMs)
    timer.unref()
  }

  private async reconnect(sessionId: string): Promise<void> {
    if (this.handles.has(sessionId)) return
    const session = await this.deps.sessions.findById(sessionId)
    if (!session || session.status === 'logged_out') return
    await this.start(session)
  }

  private async maybeRequestPairingCode(
    session: WaSessionRow,
    handle: SessionHandle,
  ): Promise<void> {
    if (handle.auth.state.creds.registered) return
    const requestKey = `wa:pairing:request:${session.id}`
    const phoneNumber = await this.deps.redis.get(requestKey)
    const targetPhone =
      phoneNumber ?? (session.status === 'connecting' ? session.phoneNumber : null)
    if (!targetPhone) return
    try {
      const code = await handle.socket.requestPairingCode(targetPhone)
      await this.deps.redis.set(`wa:pairing:code:${session.id}`, code, 'EX', 600)
      await this.deps.redis.del(requestKey)
      await this.deps.sessions.update(session.id, {
        phoneNumber: targetPhone,
        status: 'connecting',
      })
    } catch (error) {
      this.deps.logger.error({ sessionId: session.id, err: error }, 'Gagal meminta pairing code')
    }
  }

  private async onMessagesUpdate(sessionId: string, updates: unknown): Promise<void> {
    for (const update of parseMessagesUpdate(updates)) {
      await this.deps.messages.applyStatusUpdate(sessionId, update.waMessageId, update.status)
    }
  }

  async sendText(sessionId: string, toJid: string, text: string) {
    const handle = this.handles.get(sessionId)
    if (!handle) {
      throw new Error(`Socket sesi ${sessionId} belum aktif`)
    }
    return handle.socket.sendMessage(toJid, { text })
  }

  async stop(sessionId: string, clearAuth = false): Promise<void> {
    const handle = this.handles.get(sessionId)
    if (!handle) return
    this.handles.delete(sessionId)
    handle.stopRenewal()
    try {
      handle.socket.end(undefined)
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menutup socket')
    }
    if (clearAuth) {
      await handle.auth.clear()
    }
    await handle.lock.release()
    this.deps.logger.info({ sessionId, clearAuth }, 'Socket sesi dihentikan')
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.handles.keys()].map((sessionId) => this.stop(sessionId)))
  }

  static isLoggedOutStatus(statusCode?: number): boolean {
    return statusCode === DisconnectReason.loggedOut
  }
}
