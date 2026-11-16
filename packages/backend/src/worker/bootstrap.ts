import {
  deleteAuthState,
  getAuthPresence,
  hasAuthState,
  isAuthRegistered,
} from '../baileys/auth-store.js'
import type { Database } from '../db/client.js'
import type { Cipher } from '../infra/crypto.js'
import type { AppLogger } from '../infra/logger.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { SessionManager } from './session-manager.js'

export type BootstrapDeps = {
  db: Database
  cipher: Cipher
  sessions: SessionsService
  manager: SessionManager
  logger: AppLogger
}

export async function bootstrapSessions({
  db,
  cipher,
  sessions,
  manager,
  logger,
}: BootstrapDeps): Promise<number> {
  const rows = await sessions.startable()
  let started = 0

  // Logout bisa terjadi saat worker mati: bersihkan auth yang tertinggal.
  for (const row of await sessions.listByStatus('logged_out')) {
    if (!(await hasAuthState(db, row.id))) continue
    await deleteAuthState(db, row.id)
    logger.info({ sessionId: row.id }, 'Auth sesi logged_out dibersihkan')
  }

  for (const row of rows) {
    const presence = await getAuthPresence(db, row.id)
    if (presence.creds !== presence.keys) {
      logger.warn(
        { sessionId: row.id, creds: presence.creds, keys: presence.keys },
        'Auth state tidak konsisten, sesi ditandai logged_out',
      )
      await deleteAuthState(db, row.id)
      await sessions.updateStatus(row.id, 'logged_out')
      continue
    }
    if (!presence.creds) {
      logger.info({ sessionId: row.id, status: row.status }, 'Sesi tanpa auth dilewati')
      continue
    }
    // Sesi yang belum pernah pairing tidak di-start otomatis agar tidak
    // menimbulkan reconnect berulang saat worker sering restart (dev mode).
    if (!(await isAuthRegistered(db, cipher, row.id))) {
      logger.info(
        { sessionId: row.id, status: row.status },
        'Sesi belum pairing, menunggu login manual',
      )
      continue
    }
    await manager.start(row)
    started += 1
  }
  logger.info({ total: rows.length, started }, 'Bootstrap sesi selesai')
  return started
}
