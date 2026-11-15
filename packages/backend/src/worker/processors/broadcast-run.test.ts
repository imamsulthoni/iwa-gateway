import { describe, expect, it, vi } from 'vitest'

import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import type { AppLogger } from '../../infra/logger.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { SessionManager } from '../session-manager.js'
import { createBroadcastRunProcessor } from './broadcast-run.js'

vi.mock('@wa/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wa/shared')>()
  return { ...actual, pickDelayMs: () => 0 }
})

const BROADCAST: BroadcastRow = {
  id: 'b1',
  sessionId: 's1',
  name: 'Broadcast',
  template: 'Halo',
  status: 'pending',
  minDelayMs: 10_000,
  maxDelayMs: 10_000,
  referenceId: 'ref',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const RECIPIENTS: BroadcastRecipientRow[] = [
  {
    id: 1,
    broadcastId: 'b1',
    toJid: '628111111111@s.whatsapp.net',
    name: 'A',
    contactId: null,
    messageId: null,
    status: 'pending',
    error: null,
  },
  {
    id: 2,
    broadcastId: 'b1',
    toJid: '628222222222@s.whatsapp.net',
    name: 'B',
    contactId: null,
    messageId: null,
    status: 'pending',
    error: null,
  },
]

const LOGGER = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppLogger
const JOB = { data: { sessionId: 's1', broadcastId: 'b1' } }

function createDeps(sentToday = 0) {
  const broadcasts = {
    get: vi.fn(async () => BROADCAST),
    setStatus: vi.fn(async () => undefined),
    pendingRecipients: vi.fn(async () => RECIPIENTS),
    markRecipient: vi.fn(async () => undefined),
  } as unknown as BroadcastsService

  const messages = {
    countToday: vi.fn(async () => sentToday),
    createOutgoing: vi.fn(async (input: { to: string }) => ({
      message: { id: `m-${input.to}`, status: 'queued', to: input.to, body: 'Halo' },
      duplicate: false,
    })),
    markSent: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
  } as unknown as MessagesService

  const sessions = {
    get: vi.fn(async () => ({ dailySendLimit: 200 })),
  } as unknown as SessionsService

  const manager = {
    sendText: vi.fn(async () => ({ key: { id: 'wa-1' } })),
  } as unknown as SessionManager

  return { broadcasts, messages, sessions, manager }
}

describe('processor broadcast-run', () => {
  it('mengirim semua penerima dan menandai done', async () => {
    const deps = createDeps()
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.markRecipient).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.setStatus).toHaveBeenNthCalledWith(1, 'b1', 'running')
    expect(deps.broadcasts.setStatus).toHaveBeenLastCalledWith('b1', 'done')
  })

  it('menghentikan broadcast saat batas harian tercapai', async () => {
    const deps = createDeps(200)
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).not.toHaveBeenCalled()
    expect(deps.broadcasts.markRecipient).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.setStatus).toHaveBeenLastCalledWith('b1', 'failed')
  })
})
