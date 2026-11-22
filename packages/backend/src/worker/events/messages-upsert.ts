import { BufferJSON, type proto, type WAMessage } from '@whiskeysockets/baileys'
import type { SseEvent, WebhookPayload } from '@wbc/shared'
import type { Redis } from 'ioredis'

import { isIgnoredJid, resolveConversationJid } from '../../baileys/jid.js'
import { newId } from '../../db/id.js'
import { incCounter } from '../../infra/metrics.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { OptOutsService } from '../../modules/opt-outs/service.js'
import { phoneFromJid, USER_JID_SUFFIX } from '../../modules/messages/phone.js'

const MEDIA_TYPES: { key: string; type: string; label: string }[] = [
  { key: 'imageMessage', type: 'image', label: 'Gambar' },
  { key: 'videoMessage', type: 'video', label: 'Video' },
  { key: 'audioMessage', type: 'audio', label: 'Audio' },
  { key: 'documentMessage', type: 'document', label: 'Dokumen' },
  { key: 'stickerMessage', type: 'sticker', label: 'Stiker' },
  { key: 'locationMessage', type: 'location', label: 'Lokasi' },
  { key: 'liveLocationMessage', type: 'location', label: 'Lokasi' },
  { key: 'contactMessage', type: 'contact', label: 'Kontak' },
  { key: 'contactsArrayMessage', type: 'contact', label: 'Kontak' },
  { key: 'pollCreationMessage', type: 'poll', label: 'Polling' },
  { key: 'reactionMessage', type: 'reaction', label: 'Reaksi' },
]

export type IncomingMessage = {
  waMessageId: string
  fromJid: string
  waJid: string
  waJidAlt: string | null
  type: string
  body: string | null
  isText: boolean
  waTimestamp: Date | null
  raw: unknown
}

export function extractMessageContent(content: proto.IMessage | null | undefined): {
  type: string
  body: string | null
  isText: boolean
} {
  if (!content) return { type: 'unknown', body: 'Pesan', isText: false }
  const text = content.conversation ?? content.extendedTextMessage?.text
  if (typeof text === 'string' && text.trim()) {
    return { type: 'text', body: text, isText: true }
  }
  const values = content as Record<string, unknown>
  const media = MEDIA_TYPES.find((item) => Boolean(values[item.key]))
  if (media) return { type: media.type, body: media.label, isText: false }
  return { type: 'unknown', body: 'Pesan', isText: false }
}

function messageDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null
  const long = value as { toNumber?: () => number }
  const raw = typeof long.toNumber === 'function' ? long.toNumber() : Number(value)
  if (!Number.isFinite(raw)) return null
  return new Date(raw * 1000)
}

export function parseMessagesUpsert(payload: unknown): IncomingMessage[] {
  if (typeof payload !== 'object' || payload === null) return []
  const { messages, type } = payload as { messages?: unknown; type?: unknown }
  if (type !== 'notify' || !Array.isArray(messages)) return []

  const parsed: IncomingMessage[] = []
  for (const value of messages) {
    const message = value as WAMessage | null
    if (!message) continue
    const key = message.key
    if (!key?.id || !key.remoteJid || key.fromMe) continue
    if (isIgnoredJid(key.remoteJid) || (key.remoteJidAlt && isIgnoredJid(key.remoteJidAlt)))
      continue

    const content = extractMessageContent(message.message)
    const { waJid, waJidAlt } = resolveConversationJid(key.remoteJid, key.remoteJidAlt)
    parsed.push({
      waMessageId: key.id,
      fromJid: key.remoteJid,
      waJid,
      waJidAlt,
      type: content.type,
      body: content.body,
      isText: content.isText,
      waTimestamp: messageDate(message.messageTimestamp),
      raw: JSON.parse(JSON.stringify(message, BufferJSON.replacer)) as unknown,
    })
  }
  return parsed
}

export type MessagesUpsertDeps = {
  messages: Pick<MessagesService, 'ingestIncoming'>
  optOuts: Pick<OptOutsService, 'recordKeyword'>
  publish: (event: SseEvent) => Promise<void>
  webhook?: (payload: WebhookPayload) => Promise<void>
  redis?: Redis
}

export async function handleMessagesUpsert(
  sessionId: string,
  payload: unknown,
  deps: MessagesUpsertDeps,
): Promise<number> {
  let handled = 0
  let duplicates = 0
  let nonText = 0
  for (const incoming of parseMessagesUpsert(payload)) {
    const result = await deps.messages.ingestIncoming(sessionId, incoming)
    if (result.duplicate) {
      duplicates += 1
      continue
    }
    handled += 1
    if (!incoming.isText) nonText += 1

    if (incoming.isText && incoming.body) {
      const phoneJid = [incoming.waJidAlt, incoming.fromJid, incoming.waJid].find((jid) =>
        jid?.endsWith(USER_JID_SUFFIX),
      )
      await deps.optOuts.recordKeyword(phoneJid ? phoneFromJid(phoneJid) : null, incoming.body)
    }

    await deps.publish({
      id: newId(),
      event: 'message.received',
      data: { message: result.message },
    })

    await deps.webhook?.({
      id: newId(),
      type: 'message.received',
      session_id: sessionId,
      data: {
        message_id: result.message.id,
        conversation_id: result.message.conversationId,
        from: incoming.waJid,
        type: result.message.type,
        body: result.message.body,
        occurred_at: result.message.createdAt,
      },
    })
  }
  incCounter(deps.redis, 'inboundProcessed', handled)
  incCounter(deps.redis, 'inboundDuplicates', duplicates)
  incCounter(deps.redis, 'inboundNonText', nonText)
  return handled
}
