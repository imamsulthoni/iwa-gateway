import type { Job } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { BufferJSON } from '@whiskeysockets/baileys'

import type { MessageRow } from '../../db/schema.js'
import type { SendMessageJob } from '../../infra/queue.js'
import type { AppLogger } from '../../infra/logger.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionManager } from '../session-manager.js'
import { createSendMessageProcessor } from './send-message.js'

const MESSAGE: MessageRow = {
  id: 'm1',
  sessionId: 's1',
  waMessageId: null,
  referenceId: 'r1',
  direction: 'out',
  type: 'text',
  body: 'Halo',
  raw: null,
  status: 'queued',
  error: null,
  toJid: '628123456789@s.whatsapp.net',
  customerId: null,
  customerName: null,
  broadcastId: null,
  createdAt: new Date(),
  waTimestamp: null,
  deletedAt: null,
}

const JOB = { data: { sessionId: 's1', messageId: 'm1' } } as Job<SendMessageJob>
const LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as AppLogger

function createDeps(overrides: { sendText?: () => Promise<unknown> } = {}) {
  const messages = {
    get: vi.fn(async () => MESSAGE),
    markSent: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  } as unknown as MessagesService

  const manager = {
    sendText: overrides.sendText ?? vi.fn(async () => ({ key: { id: 'wa-1' } })),
  } as unknown as SessionManager

  return { messages, manager }
}

describe('processor send-message', () => {
  it('mengirim lewat manager dan menandai sent', async () => {
    const { messages, manager } = createDeps()
    const processor = createSendMessageProcessor({ manager, messages, logger: LOGGER })

    await processor(JOB)

    expect(manager.sendText).toHaveBeenCalledWith('s1', MESSAGE.toJid, 'Halo')
    expect(messages.markSent).toHaveBeenCalledWith(
      'm1',
      'wa-1',
      JSON.stringify({ key: { id: 'wa-1' } }, BufferJSON.replacer),
    )
  })

  it('menandai failed lalu melempar ulang saat pengiriman gagal', async () => {
    const { messages, manager } = createDeps({
      sendText: async () => {
        throw new Error('socket mati')
      },
    })
    const processor = createSendMessageProcessor({ manager, messages, logger: LOGGER })

    await expect(processor(JOB)).rejects.toThrow('socket mati')
    expect(messages.markFailed).toHaveBeenCalledWith('m1', 'socket mati')
  })

  it('melewati pesan yang sudah tidak queued', async () => {
    const { messages, manager } = createDeps()
    ;(messages.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...MESSAGE,
      status: 'sent',
    })

    const processor = createSendMessageProcessor({ manager, messages, logger: LOGGER })
    await processor(JOB)

    expect(manager.sendText).not.toHaveBeenCalled()
    expect(messages.markSent).not.toHaveBeenCalled()
  })
})
