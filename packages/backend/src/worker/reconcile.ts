import { hasAuthState, useDbAuthState } from '../baileys/auth-store.js'
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

const STARTABLE = new Set(['connecting', 'connected', 'disconnected', 'qr_pending'])

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
    if (!hasAuth && row.status !== 'connecting') continue
    if (!hasAuth && row.status === 'connecting') {
      await useDbAuthState(row.id, { db, cipher, logger })
    }
    await manager.start(row)
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
