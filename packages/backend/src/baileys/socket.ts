import makeWASocket, {
  Browsers,
  type AuthenticationState,
  type CacheStore,
  type WASocket,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'

import type { AppLogger } from '../infra/logger.js'
import { isIgnoredJid } from './jid.js'

export type CreateSocketOptions = {
  auth: AuthenticationState
  logger: AppLogger
  browserName: string
  msgRetryCounterCache: CacheStore
  getMessage?: (key: WAMessageKey) => Promise<proto.IMessage | undefined>
}

function baileysLogger(logger: AppLogger) {
  const adapter = {
    level: 'silent',
    child: () => adapter,
    trace: (obj: unknown, message?: string) => logger.trace(obj, message ?? 'baileys'),
    debug: (obj: unknown, message?: string) => logger.debug(obj, message ?? 'baileys'),
    info: (obj: unknown, message?: string) => logger.info(obj, message ?? 'baileys'),
    warn: (obj: unknown, message?: string) => logger.warn(obj, message ?? 'baileys'),
    error: (obj: unknown, message?: string) => logger.error(obj, message ?? 'baileys'),
  }
  return adapter as unknown as Parameters<typeof makeWASocket>[0]['logger']
}

export function createSocket({
  auth,
  logger,
  browserName,
  msgRetryCounterCache,
  getMessage,
}: CreateSocketOptions): WASocket {
  return makeWASocket({
    auth,
    browser: Browsers.ubuntu(browserName),
    logger: baileysLogger(logger),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    shouldIgnoreJid: (jid) => isIgnoredJid(jid),
    generateHighQualityLinkPreview: false,
    msgRetryCounterCache,
    getMessage,
  })
}
