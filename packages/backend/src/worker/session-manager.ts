import { DisconnectReason, type WASocket } from '@whiskeysockets/baileys'
import type { Redis } from 'ioredis'
import QRCode from 'qrcode'

import { useDbAuthState, type DbAuthState } from '../baileys/auth-store.js'
import { jidDecode } from '../baileys/jid.js'
import { createGetMessage } from '../baileys/message-retry.js'
import { createSocket } from '../baileys/socket.js'
import type { Database } from '../db/client.js'
import type { WaSessionRow } from '../db/schema.js'
import type { Cipher } from '../infra/crypto.js'
import { SessionLock } from '../infra/lock.js'
import type { AppLogger } from '../infra/logger.js'
import { createKeyCache } from '../baileys/key-cache.js'
import type { MessagesService } from '../modules/messages/service.js'
import type { SessionsRepository } from '../modules/sessions/repository.js'
import { parseConnectionUpdate, type ConnectionUpdateInput } from './events/connection.js'
import { parseMessagesUpdate } from './events/messages-update.js'

type SessionHandle = {
  socket: WASocket
  lock: SessionLock
  auth: DbAuthState
  stopRenewal: () => void
  pendingCredsSave: Promise<void>
}

type OnWhatsAppResult = { exists: boolean; jid: string }

const ON_WHATSAPP_TTL_MS = 60_000
const RETRY_COUNTER_TTL_MS = 15 * 60_000

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
  private readonly retryCounterCache = createKeyCache(RETRY_COUNTER_TTL_MS)
  private readonly onWhatsAppCache = createKeyCache(ON_WHATSAPP_TTL_MS)

  constructor(private readonly deps: SessionManagerDeps) {}

  has(sessionId: string): boolean {
    return this.handles.has(sessionId)
  }

  activeSessionIds(): string[] {
    return [...this.handles.keys()]
  }

  async start(session: WaSessionRow): Promise<void> {
    if (this.handles.has(session.id)) return
    if (session.status === 'logged_out') return

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
      msgRetryCounterCache: this.retryCounterCache,
      getMessage: createGetMessage(this.deps.messages, session.id),
    })
    const handle: SessionHandle = {
      socket,
      lock,
      auth,
      stopRenewal: lock.startRenewal(() => {
        void this.onLockLost(session.id)
      }),
      pendingCredsSave: Promise.resolve(),
    }
    this.handles.set(session.id, handle)
    this.wire(session.id, handle)

    this.deps.logger.info({ sessionId: session.id }, 'Socket sesi dimulai')
  }

  private wire(sessionId: string, handle: SessionHandle): void {
    handle.socket.ev.on('creds.update', () => {
      // Socket lama (sudah dihentikan) tidak boleh menulis creds lagi.
      if (this.handles.get(sessionId) !== handle) return
      handle.pendingCredsSave = handle.auth.saveCreds().catch((error: unknown) => {
        this.deps.logger.error({ sessionId, err: error }, 'Gagal menyimpan creds')
      })
    })
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
    // Event dari socket yang sudah diganti (logout/cancel/restart) diabaikan
    // agar tidak menimpa status terbaru di database.
    if (this.handles.get(sessionId) !== handle) return
    const event = parseConnectionUpdate(update)
    if (!event) return

    const session = await this.deps.sessions.findById(sessionId)
    if (!session || session.status === 'logged_out') return
    if (this.handles.get(sessionId) !== handle) return

    if (event.kind === 'qr') {
      const dataUrl = await QRCode.toDataURL(event.qr)
      if (this.handles.get(sessionId) !== handle) return
      await this.deps.sessions.update(sessionId, { status: 'qr_pending', lastQr: dataUrl })
      await this.maybeRequestPairingCode(sessionId)
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
      await this.deps.sessions.update(sessionId, { status: 'logged_out', lastQr: null })
      return
    }

    // 515 restartRequired adalah penutupan normal tepat setelah pairing sukses:
    // sambung ulang segera tanpa menandai sesi terputus.
    if (event.restartRequired) {
      await this.restart(sessionId)
      return
    }

    const registered = Boolean(handle.auth.state.creds.registered)
    await this.stop(sessionId)
    await this.deps.sessions.update(
      sessionId,
      // QR lama sudah tidak valid setelah koneksi tutup; jangan tampilkan lagi.
      registered ? { status: 'disconnected' } : { status: 'disconnected', lastQr: null },
    )
    // Sesi yang belum pairing tidak di-reconnect otomatis agar tidak
    // kena rate limit WhatsApp (429) — tunggu user menekan Scan QR.
    if (registered) {
      this.scheduleReconnect(sessionId)
    }
  }

  private async restart(sessionId: string): Promise<void> {
    await this.stop(sessionId)
    const session = await this.deps.sessions.findById(sessionId)
    if (!session || session.status === 'logged_out') return
    await this.start(session)
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

  private async maybeRequestPairingCode(sessionId: string): Promise<void> {
    const handle = this.handles.get(sessionId)
    if (!handle || handle.auth.state.creds.registered) return
    const session = await this.deps.sessions.findById(sessionId)
    if (!session) return
    const requestKey = `wa:pairing:request:${sessionId}`
    const phoneNumber = await this.deps.redis.get(requestKey)
    if (!phoneNumber) return
    try {
      const code = await handle.socket.requestPairingCode(phoneNumber)
      await this.deps.redis.set(`wa:pairing:code:${sessionId}`, code, 'EX', 600)
      await this.deps.redis.del(requestKey)
      await this.deps.sessions.update(sessionId, {
        phoneNumber,
        status: 'connecting',
      })
    } catch (error) {
      this.deps.logger.error({ sessionId, err: error }, 'Gagal meminta pairing code')
    }
  }

  private async onLockLost(sessionId: string): Promise<void> {
    this.deps.logger.warn({ sessionId }, 'Lock sesi hilang, socket dihentikan')
    await this.stop(sessionId)
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
    const jid = await this.resolveRecipientJid(sessionId, handle, toJid)
    return handle.socket.sendMessage(jid, { text })
  }

  private async resolveRecipientJid(
    sessionId: string,
    handle: SessionHandle,
    toJid: string,
  ): Promise<string> {
    const digits = jidDecode(toJid)?.user
    if (!digits || !/^\d+$/.test(digits)) return toJid

    const cacheKey = `onwa:${digits}`
    const cached = this.onWhatsAppCache.get<OnWhatsAppResult>(cacheKey)
    if (cached) {
      if (!cached.exists) {
        throw new Error(`Nomor ${digits} tidak terdaftar di WhatsApp`)
      }
      return cached.jid
    }

    const results = (await handle.socket.onWhatsApp(digits)) ?? []
    const result = results[0]
    this.onWhatsAppCache.set<OnWhatsAppResult>(
      cacheKey,
      result ?? { exists: false, jid: toJid },
    )
    if (!result?.exists) {
      throw new Error(`Nomor ${digits} tidak terdaftar di WhatsApp`)
    }
    return result.jid
  }

  async stop(sessionId: string, clearAuth = false): Promise<void> {
    const handle = this.handles.get(sessionId)
    if (!handle) return
    this.handles.delete(sessionId)
    handle.stopRenewal()
    // Pastikan creds terakhir (mis. hasil pairing) sudah tersimpan sebelum
    // socket baru membaca ulang state dari database.
    await handle.pendingCredsSave
    if (clearAuth && handle.auth.state.creds.registered && handle.socket.ws?.isOpen) {
      try {
        // Lepas perangkat di sisi WhatsApp, bukan hanya menutup socket lokal.
        await handle.socket.logout()
      } catch (error) {
        this.deps.logger.warn({ sessionId, err: error }, 'Gagal logout perangkat')
      }
    }
    try {
      handle.socket.end(undefined)
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menutup socket')
    }
    if (clearAuth) {
      await handle.auth.clear()
      await this.clearPairingKeys(sessionId)
    }
    await handle.lock.release()
    this.deps.logger.info({ sessionId, clearAuth }, 'Socket sesi dihentikan')
  }

  private async clearPairingKeys(sessionId: string): Promise<void> {
    try {
      await this.deps.redis.del(
        `wa:pairing:request:${sessionId}`,
        `wa:pairing:code:${sessionId}`,
      )
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menghapus state pairing')
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.handles.keys()].map((sessionId) => this.stop(sessionId)))
  }

  static isLoggedOutStatus(statusCode?: number): boolean {
    return statusCode === DisconnectReason.loggedOut
  }
}
