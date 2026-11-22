import { describe, expect, it, vi } from 'vitest'
import type { Redis } from 'ioredis'

import type { SseEvent } from '@wbc/shared'

import type { MessagesService } from '../../modules/messages/service.js'
import type { OptOutsService } from '../../modules/opt-outs/service.js'
import {
  extractMessageContent,
  handleMessagesUpsert,
  parseMessagesUpsert,
} from './messages-upsert.js'

const PN = '628123456789@s.whatsapp.net'
const LID = '123456789012345@lid'

function message(overrides: Record<string, unknown> = {}) {
  return {
    key: { id: 'wa-1', remoteJid: LID, remoteJidAlt: PN, fromMe: false },
    message: { conversation: 'Halo' },
    messageTimestamp: 1_700_000_000,
    ...overrides,
  }
}

describe('messages.upsert', () => {
  it('hanya memproses notify dan mengabaikan grup serta pesan keluar sendiri', () => {
    expect(parseMessagesUpsert({ type: 'append', messages: [message()] })).toEqual([])
    expect(
      parseMessagesUpsert({
        type: 'notify',
        messages: [
          message({ key: { id: 'g1', remoteJid: '1203630@g.us' } }),
          message({ key: { id: 'o1', remoteJid: PN, fromMe: true } }),
        ],
      }),
    ).toEqual([])
  })

  it('menyimpan teks dengan LID kanonis dan PN sebagai alt', () => {
    const [parsed] = parseMessagesUpsert({ type: 'notify', messages: [message()] })

    expect(parsed).toMatchObject({
      waMessageId: 'wa-1',
      fromJid: LID,
      waJid: LID,
      waJidAlt: PN,
      type: 'text',
      body: 'Halo',
      isText: true,
    })
    expect(parsed?.waTimestamp?.toISOString()).toBe('2023-11-14T22:13:20.000Z')
  })

  it('mencatat jenis pesan non-teks sebagai label tanpa mengunduh media', () => {
    expect(extractMessageContent({ imageMessage: { mimetype: 'image/jpeg' } })).toEqual({
      type: 'image',
      body: 'Gambar',
      isText: false,
    })
    expect(extractMessageContent({ documentMessage: {} })).toEqual({
      type: 'document',
      body: 'Dokumen',
      isText: false,
    })
    expect(extractMessageContent({ unknownMessage: {} } as never)).toEqual({
      type: 'unknown',
      body: 'Pesan',
      isText: false,
    })
  })

  it('mengabaikan event ganda dan mencatat opt-out dari pesan teks', async () => {
    const ingestIncoming = vi
      .fn()
      .mockResolvedValueOnce({
        message: {
          id: 'm1',
          conversationId: 'c1',
          sessionId: 's1',
          direction: 'in',
          type: 'text',
          body: ' stop ',
          status: 'delivered',
          clientRef: null,
          waMessageId: 'wa-1',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        duplicate: false,
      })
      .mockResolvedValueOnce({ message: { id: 'm1' }, duplicate: true })
    const recordKeyword = vi.fn(async () => true)
    const publish = vi.fn(async (_event: SseEvent) => undefined)
    const webhook = vi.fn(async () => undefined)
    const redis = { hincrby: vi.fn(async () => 1) } as unknown as Redis

    const handled = await handleMessagesUpsert(
      's1',
      { type: 'notify', messages: [message({ message: { conversation: ' stop ' } }), message()] },
      {
        messages: { ingestIncoming } as unknown as Pick<MessagesService, 'ingestIncoming'>,
        optOuts: { recordKeyword } as unknown as Pick<OptOutsService, 'recordKeyword'>,
        publish,
        webhook,
        redis,
      },
    )

    expect(handled).toBe(1)
    expect(redis.hincrby).toHaveBeenCalledWith('wa:metrics', 'inboundProcessed', 1)
    expect(redis.hincrby).toHaveBeenCalledWith('wa:metrics', 'inboundDuplicates', 1)
    expect(recordKeyword).toHaveBeenCalledWith('628123456789', ' stop ')
    expect(publish).toHaveBeenCalledOnce()
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ event: 'message.received' }))
    expect(webhook).toHaveBeenCalledOnce()
    expect(webhook).toHaveBeenCalledWith({
      id: expect.any(String),
      type: 'message.received',
      session_id: 's1',
      data: {
        message_id: 'm1',
        conversation_id: 'c1',
        from: LID,
        type: 'text',
        body: ' stop ',
        occurred_at: '2026-01-01T00:00:00.000Z',
      },
    })
  })
})
