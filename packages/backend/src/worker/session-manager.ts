import {
  DisconnectReason,
  S_WHATSAPP_NET,
  type AuthenticationCreds,
  type WASocket,
} from '@whiskeysockets/baileys'
import type { Redis } from 'ioredis'
import QRCode from 'qrcode'
import type { SseEvent, WebhookPayload } from '@wbc/shared'

import { useDbAuthState, type DbAuthState } from '../baileys/auth-store.js'
import { createGetMessage } from '../baileys/message-retry.js'
import { createSocket } from '../baileys/socket.js'
import type { Database } from '../db/client.js'
import { newId } from '../db/id.js'
import type { WaSessionRow } from '../db/schema.js'
import type { Cipher } from '../infra/crypto.js'
import { SessionLock } from '../infra/lock.js'
import type { AppLogger } from '../infra/logger.js'
import { publishSessionEvent } from '../infra/pubsub.js'
import { createKeyCache } from '../baileys/key-cache.js'
import type { MessagesService } from '../modules/messages/service.js'
import { normalizePhone, phoneFromJid } from '../modules/messages/phone.js'
import type { OptOutsService } from '../modules/opt-outs/service.js'
import type { SessionsRepository } from '../modules/sessions/repository.js'
import type { WebhookOutbox } from '../modules/webhooks/outbox.js'
import { SendTimeoutError, SessionNotReadyError } from '../modules/errors.js'
import { parseConnectionUpdate, type ConnectionUpdateInput } from './events/connection.js'
import { parseMessagesUpdate } from './events/messages-update.js'
import { handleMessagesUpsert } from './events/messages-upsert.js'

type SessionHandle = {
  socket: WASocket
  lock: SessionLock
  auth: DbAuthState
  stopRenewal: () => void
  pendingCredsSave: Promise<void>
  // Kita sedang melepas perangkat ini sendiri: abaikan event close dari
  // server agar tidak diproses sebagai sesi logout biasa.
  unlinking: boolean
}

const RETRY_COUNTER_TTL_MS = 15 * 60_000

// IQ remove-companion-device butuh ack server; klien resmi memakai 32 detik.
// 20 detik cukup lapang tanpa menahan stop() terlalu lama.
const UNLINK_TIMEOUT_MS = 20_000

// remove-companion-device kadang diabaikan server; satu percobaan ulang.
const UNLINK_ATTEMPTS = 2

// Kirim yang menggantung (socket half-open) tidak boleh menahan job antrean
// selamanya; lewat batas ini pengiriman gagal dan user bisa kirim ulang.
const SEND_TIMEOUT_MS = 20_000

function withTimeout<T>(promise: Promise<T>, timeoutMs = SEND_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SendTimeoutError()), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

// "628123456789:12@s.whatsapp.net" -> "628123456789"
function phoneFromCreds(meId: string | undefined): string | undefined {
  const user = meId?.split('@')[0]?.split(':')[0]
  return user || undefined
}

// Nomor sesi bisa tersimpan sebagai 08.., sedangkan creds selalu 62..
function samePhone(left: string, right: string): boolean {
  try {
    return normalizePhone(left) === normalizePhone(right)
  } catch {
    return false
  }
}

// Pairing QR tidak men-set creds.registered; kehadiran me.id menandakan
// perangkat sudah tertaut dan boleh di-start/reconnect otomatis.
function isPaired(creds: AuthenticationCreds): boolean {
  return Boolean(creds.registered || creds.me?.id)
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
  optOuts: OptOutsService
  webhooks: WebhookOutbox
}

export class SessionManager {
  private readonly handles = new Map<string, SessionHandle>()
  private readonly reconnectAttempts = new Map<string, number>()
  private readonly retryCounterCache = createKeyCache(RETRY_COUNTER_TTL_MS)

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
      browserName: `${this.deps.browserName} ${session.label}`.slice(0, 40),
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
      unlinking: false,
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
    handle.socket.ev.on('messages.upsert', (payload) => {
      void this.onMessagesUpsert(sessionId, payload)
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
    if (handle.unlinking) return
    const event = parseConnectionUpdate(update)
    if (!event) return

    const session = await this.deps.sessions.findById(sessionId)
    if (!session || session.status === 'logged_out') return
    if (this.handles.get(sessionId) !== handle) return

    if (event.kind === 'qr') {
      await this.clearRejectReason(sessionId)
      const dataUrl = await QRCode.toDataURL(event.qr)
      if (this.handles.get(sessionId) !== handle) return
      await this.deps.sessions.update(sessionId, { status: 'qr_pending', lastQr: dataUrl })
      await this.publish(sessionId, {
        id: newId(),
        event: 'session.qr',
        data: { qr: dataUrl, status: 'qr_pending' },
      })
      await this.maybeRequestPairingCode(sessionId)
      return
    }

    if (event.kind === 'open') {
      const actual = phoneFromCreds(handle.auth.state.creds.me?.id)
      if (session.phoneNumber && actual && !samePhone(session.phoneNumber, actual)) {
        await this.rejectPairing(sessionId, handle, session.phoneNumber, actual)
        return
      }
      this.reconnectAttempts.delete(sessionId)
      await this.clearRejectReason(sessionId)
      await this.deps.sessions.update(sessionId, {
        status: 'connected',
        lastQr: null,
        lastConnectedAt: new Date(),
      })
      await this.syncPhoneNumber(sessionId, handle, session)
      await this.publishSessionStatus(sessionId)
      return
    }

    // 401 (logout) dan 403 (nomor diblokir) sama-sama terminal: socket
    // dihentikan, auth dihapus, dan sesi tidak di-reconnect otomatis.
    if (event.loggedOut || event.forbidden) {
      this.deps.logger.warn(
        { sessionId, statusCode: event.statusCode },
        event.forbidden ? 'Nomor diblokir WhatsApp, auth dihapus' : 'Sesi logout, auth dihapus',
      )
      // Server sudah memutus kita, IQ remove-companion-device tidak akan dijawab.
      await this.stop(sessionId, true, { skipUnlink: true })
      await this.deps.sessions.update(sessionId, { status: 'logged_out', lastQr: null })
      await this.publishSessionStatus(sessionId)
      return
    }

    // 515 restartRequired adalah penutupan normal tepat setelah pairing sukses:
    // tandai connecting agar kirim pesan ditolak selama socket belum siap,
    // lalu sambung ulang tanpa menandai sesi terputus.
    if (event.restartRequired) {
      await this.deps.sessions.update(sessionId, { status: 'connecting' })
      await this.publishSessionStatus(sessionId)
      await this.restart(sessionId)
      return
    }

    const paired = isPaired(handle.auth.state.creds)
    await this.stop(sessionId)
    await this.deps.sessions.update(
      sessionId,
      // QR lama sudah tidak valid setelah koneksi tutup; jangan tampilkan lagi.
      paired ? { status: 'disconnected' } : { status: 'disconnected', lastQr: null },
    )
    await this.publishSessionStatus(sessionId)
    // Sesi yang belum pairing tidak di-reconnect otomatis agar tidak
    // kena rate limit WhatsApp (429) — tunggu user menekan Scan QR.
    if (paired) {
      this.scheduleReconnect(sessionId)
    }
  }

  private async rejectPairing(
    sessionId: string,
    handle: SessionHandle,
    expected: string,
    actual: string,
  ): Promise<void> {
    handle.unlinking = true
    this.deps.logger.warn(
      { sessionId, expected, actual },
      'Nomor pairing beda dengan nomor sesi, pairing ditolak',
    )
    const unlinked = await this.unlinkDevice(sessionId, handle)
    // Selalu hapus creds nomor B: tanpa creds, perangkat tidak bisa dipakai
    // lagi walau entri device masih tampil di HP.
    await this.stop(sessionId, true, { skipUnlink: true })
    if (!unlinked) {
      this.deps.logger.error(
        { sessionId, expected, actual },
        'Gagal melepas perangkat pairing, hapus manual di HP nomor tersebut',
      )
    }

    await this.setRejectReason(
      sessionId,
      `Nomor yang discan (${actual}) tidak sama dengan nomor sesi (${expected}). Pairing ditolak.${
        unlinked ? '' : ` Perangkat gagal dilepas otomatis; hapus manual di HP nomor ${actual}.`
      }`,
    )
    await this.deps.sessions.update(sessionId, { status: 'disconnected', lastQr: null })
    await this.publishSessionStatus(sessionId)
  }

  /**
   * Lepas perangkat di sisi WhatsApp. `socket.logout()` hanya menulis IQ ke
   * socket lalu langsung menutup koneksi, sehingga server sering tidak sempat
   * memprosesnya dan device tetap tertinggal. Di sini IQ dikirim lewat
   * `query()` dan kita menunggu ack sebelum socket ditutup.
   */
  private async unlinkDevice(sessionId: string, handle: SessionHandle): Promise<boolean> {
    const creds = handle.auth.state.creds
    const jid = creds.me?.id
    if (!jid) return true
    for (let attempt = 1; attempt <= UNLINK_ATTEMPTS; attempt += 1) {
      try {
        const ack = await withTimeout(
          handle.socket.query({
            tag: 'iq',
            attrs: { to: S_WHATSAPP_NET, type: 'set', xmlns: 'md' },
            content: [
              {
                tag: 'remove-companion-device',
                attrs: { jid, reason: 'user_initiated' },
              },
            ],
          }),
          UNLINK_TIMEOUT_MS,
        )
        this.deps.logger.info(
          { sessionId, attempt, jid, lid: creds.me?.lid, ack },
          'Ack remove-companion-device',
        )
        return true
      } catch (error) {
        this.deps.logger.warn(
          { sessionId, attempt, err: error },
          attempt < UNLINK_ATTEMPTS
            ? 'Gagal melepas perangkat, mencoba ulang'
            : 'Gagal melepas perangkat',
        )
      }
    }
    return false
  }

  private async setRejectReason(sessionId: string, reason: string): Promise<void> {
    try {
      await this.deps.redis.set(`wa:session:reason:${sessionId}`, reason)
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menyimpan alasan penolakan')
    }
  }

  private async clearRejectReason(sessionId: string): Promise<void> {
    try {
      await this.deps.redis.del(`wa:session:reason:${sessionId}`)
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menghapus alasan penolakan')
    }
  }

  private async syncPhoneNumber(
    sessionId: string,
    handle: SessionHandle,
    session: WaSessionRow,
  ): Promise<void> {
    if (session.phoneNumber) return
    const phoneNumber = phoneFromCreds(handle.auth.state.creds.me?.id)
    if (!phoneNumber) return
    try {
      await this.deps.sessions.update(sessionId, { phoneNumber })
    } catch (error) {
      // Nomor bisa sudah dipakai sesi lain (unique index wa_sessions_phone_uq).
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menyimpan nomor sesi')
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
    if (!handle || isPaired(handle.auth.state.creds)) return
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
      const changed = await this.deps.messages.applyStatusUpdate(
        sessionId,
        update.waMessageId,
        update.status,
      )
      if (!changed) continue
      await this.publish(sessionId, {
        id: newId(),
        event: 'message.status',
        data: {
          messageId: changed.id,
          sessionId,
          status: changed.status,
          occurredAt: new Date().toISOString(),
        },
      })
      await this.recordWebhook({
        id: newId(),
        type: 'message.status',
        session_id: sessionId,
        data: {
          message_id: changed.id,
          client_ref: changed.clientRef,
          to: changed.toJid,
          phone: changed.toJid ? phoneFromJid(changed.toJid) : null,
          status: changed.status,
          occurred_at: new Date().toISOString(),
        },
      })
    }
  }

  private async onMessagesUpsert(sessionId: string, payload: unknown): Promise<void> {
    try {
      await handleMessagesUpsert(sessionId, payload, {
        messages: this.deps.messages,
        optOuts: this.deps.optOuts,
        publish: (event) => this.publish(sessionId, event),
        webhook: (event) => this.recordWebhook(event),
        redis: this.deps.redis,
      })
    } catch (error) {
      this.deps.logger.error({ sessionId, err: error }, 'Gagal memproses pesan masuk')
    }
  }

  private async publish(sessionId: string, event: SseEvent): Promise<void> {
    try {
      await publishSessionEvent(this.deps.redis, sessionId, event)
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal publish event sesi')
    }
  }

  private async publishSessionStatus(sessionId: string): Promise<void> {
    const session = await this.deps.sessions.findById(sessionId)
    if (!session) return
    await this.publish(sessionId, {
      id: newId(),
      event: 'session.status',
      data: {
        status: session.status,
        phoneNumber: session.phoneNumber,
        lastConnectedAt: session.lastConnectedAt?.toISOString() ?? null,
      },
    })
    if (['connected', 'disconnected', 'logged_out'].includes(session.status)) {
      await this.recordWebhook({
        id: newId(),
        type: 'session.status',
        session_id: sessionId,
        data: {
          status: session.status as 'connected' | 'disconnected' | 'logged_out',
          phone_number: session.phoneNumber,
          occurred_at: new Date().toISOString(),
        },
      })
    }
  }

  private async recordWebhook(payload: WebhookPayload): Promise<void> {
    try {
      await this.deps.webhooks.record(payload)
    } catch (error) {
      this.deps.logger.warn(
        { sessionId: payload.session_id, eventType: payload.type, err: error },
        'Gagal menulis outbox webhook',
      )
    }
  }

  async sendText(sessionId: string, toJid: string, text: string) {
    const handle = this.handles.get(sessionId)
    if (!handle) {
      throw new SessionNotReadyError()
    }
    // Socket bisa tertutup lebih dulu sebelum event close diproses; jangan
    // menunggu event agar status sesi tidak menipu.
    if (!handle.socket.ws?.isOpen) {
      await this.markDisconnected(sessionId)
      throw new SessionNotReadyError()
    }
    // Langsung kirim ke JID tujuan: query usync (onWhatsApp) bisa menggantung
    // saat socket half-open dan membuat pesan tertahan "queued" selamanya.
    return withTimeout(handle.socket.sendMessage(toJid, { text }))
  }

  private async markDisconnected(sessionId: string): Promise<void> {
    try {
      const changed = await this.deps.sessions.markDisconnectedIfLive(sessionId)
      if (changed) {
        this.deps.logger.warn({ sessionId }, 'Socket tertutup, sesi ditandai disconnected')
      }
    } catch (error) {
      this.deps.logger.warn({ sessionId, err: error }, 'Gagal menandai sesi terputus')
    }
  }

  async stop(
    sessionId: string,
    clearAuth = false,
    options: { skipUnlink?: boolean } = {},
  ): Promise<void> {
    const handle = this.handles.get(sessionId)
    if (!handle) return
    this.handles.delete(sessionId)
    handle.stopRenewal()
    // Pastikan creds terakhir (mis. hasil pairing) sudah tersimpan sebelum
    // socket baru membaca ulang state dari database.
    await handle.pendingCredsSave
    if (clearAuth && !options.skipUnlink && isPaired(handle.auth.state.creds)) {
      // Tanpa syarat ws.isOpen: socket half-open masih bisa mengirim IQ.
      const unlinked = await this.unlinkDevice(sessionId, handle)
      // Creds tetap dihapus di bawah, tetapi entri device bisa tertinggal di
      // HP; catat sebagai error agar bisa ditindaklanjuti manual.
      if (!unlinked) {
        this.deps.logger.error(
          { sessionId, phone: phoneFromCreds(handle.auth.state.creds.me?.id) },
          'Gagal melepas perangkat sesi, hapus manual di daftar perangkat tertaut',
        )
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
      await this.clearRejectReason(sessionId)
    }
    // Tandai sesi tidak lagi hidup agar API menolak kirim pesan selama socket
    // tidak ada. Dilakukan sebelum lock dilepas supaya proses lain tidak
    // sempat men-set status baru lebih dulu.
    await this.markDisconnected(sessionId)
    await handle.lock.release()
    this.deps.logger.info({ sessionId, clearAuth }, 'Socket sesi dihentikan')
  }

  private async clearPairingKeys(sessionId: string): Promise<void> {
    try {
      await this.deps.redis.del(`wa:pairing:request:${sessionId}`, `wa:pairing:code:${sessionId}`)
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
