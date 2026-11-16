import { DisconnectReason } from '@whiskeysockets/baileys'

export type ConnectionUpdateInput = {
  connection?: 'connecting' | 'open' | 'close' | string
  qr?: string
  lastDisconnect?: {
    error?: unknown
  }
}

export type ConnectionEvent =
  | { kind: 'qr'; qr: string }
  | { kind: 'open' }
  | {
      kind: 'close'
      loggedOut: boolean
      forbidden: boolean
      restartRequired: boolean
      statusCode?: number
    }
  | null

export function parseConnectionUpdate(update: ConnectionUpdateInput): ConnectionEvent {
  if (update.qr) {
    return { kind: 'qr', qr: update.qr }
  }
  if (update.connection === 'open') {
    return { kind: 'open' }
  }
  if (update.connection === 'close') {
    const error = update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
    const statusCode = error?.output?.statusCode
    return {
      kind: 'close',
      loggedOut: statusCode === DisconnectReason.loggedOut,
      forbidden: statusCode === DisconnectReason.forbidden,
      restartRequired: statusCode === DisconnectReason.restartRequired,
      statusCode,
    }
  }
  return null
}
