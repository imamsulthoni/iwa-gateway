import { hasAuthState, isAuthRegistered, useDbAuthState } from '../baileys/auth-store.js'
import type { Database } from '../db/client.js'
import type { Cipher } from '../infra/crypto.js'
import type { AppLogger } from '../infra/logger.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { SessionManager } from './session-manager.js'

export type ReconcileDeps = {
  db: Database
  sessions: SessionsService
  manager: SessionManager
  cipher: Cipher
  logger: AppLogger
}

const STARTABLE = new Set(['created', 'connecting', 'connected', 'disconnected', 'qr_pending'])
// Status yang boleh di-start tanpa auth state: sesi baru atau user menekan login.
const AUTO_START = new Set(['created', 'connecting'])

export async function reconcileSessions({
  db,
  sessions,
  manager,
  cipher,
  logger,
}: ReconcileDeps): Promise<void> {
  const rows = await sessions.startable()

  for (const row of rows) {
    if (manager.has(row.id)) continue
    const hasAuth = await hasAuthState(db, row.id)
    if (!hasAuth) {
      if (!AUTO_START.has(row.status)) continue
      await useDbAuthState(row.id, { db, cipher, logger })
      await manager.start(row)
      continue
    }
    if (AUTO_START.has(row.status)) {
      await manager.start(row)
      continue
    }
    // Sesi dengan auth yang belum pairing tidak di-start ulang otomatis
    // agar tidak memicu rate limit WhatsApp (429) — tunggu login manual.
    if (await isAuthRegistered(db, cipher, row.id)) {
      await manager.start(row)
    }
  }

  for (const sessionId of manager.activeSessionIds()) {
    if (rows.some((row) => row.id === sessionId && STARTABLE.has(row.status))) continue
    try {
      const row = await sessions.get(sessionId)
      if (row.status === 'logged_out') {
        await manager.stop(sessionId, true)
      } else if (!STARTABLE.has(row.status)) {
        await manager.stop(sessionId)
      }
    } catch {
      await manager.stop(sessionId)
    }
  }
}
