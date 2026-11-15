import { BufferJSON, type WAMessageKey, type proto } from '@whiskeysockets/baileys'

import type { MessagesService } from '../modules/messages/service.js'

export type GetMessageFn = (key: WAMessageKey) => Promise<proto.IMessage | undefined>

export function createGetMessage(
  messages: Pick<MessagesService, 'getRaw'>,
  sessionId: string,
): GetMessageFn {
  return async (key) => {
    const waMessageId = key.id
    if (!waMessageId) return undefined
    const raw = await messages.getRaw(sessionId, waMessageId)
    if (!raw) return undefined
    if (typeof raw === 'string') {
      return JSON.parse(raw, BufferJSON.reviver) as proto.IMessage
    }
    return raw as proto.IMessage
  }
}
