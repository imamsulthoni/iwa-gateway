import { deleteAuthState, getAuthPresence } from '../baileys/auth-store.js'
import type { Database } from '../db/client.js'
import type { AppLogger } from '../infra/logger.js'
import type { SessionsService } from '../modules/sessions/service.js'
import type { SessionManager } from './session-manager.js'

export type BootstrapDeps = {
  db: Database
  sessions: SessionsService
  manager: SessionManager
  logger: AppLogger
}

export async function bootstrapSessions({
  db,
  sessions,
  manager,
  logger,
}: BootstrapDeps): Promise<number> {
  const rows = await sessions.startable()
  let started = 0
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
    await manager.start(row)
    started += 1
  }
  logger.info({ total: rows.length, started }, 'Bootstrap sesi selesai')
  return started
}
