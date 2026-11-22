import { describe, expect, it, vi } from 'vitest'

import type { BroadcastRecipientRow, BroadcastRow } from '../../db/schema.js'
import type { AppLogger } from '../../infra/logger.js'
import type { BroadcastsService } from '../../modules/broadcasts/service.js'
import type { MessagesService } from '../../modules/messages/service.js'
import type { SessionsService } from '../../modules/sessions/service.js'
import type { SessionManager } from '../session-manager.js'
import { createBroadcastRunProcessor } from './broadcast-run.js'

vi.mock('@wbc/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wbc/shared')>()
  return { ...actual, pickDelayMs: () => 0 }
})

const BROADCAST: BroadcastRow = {
  id: 'b1',
  sessionId: 's1',
  text: 'Halo',
  status: 'pending',
  minDelayMs: 10_000,
  maxDelayMs: 10_000,
  clientRef: 'ref',
  scheduledAt: null,
  startedAt: null,
  finishedAt: null,
  pauseReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function recipients(count = 2): BroadcastRecipientRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    broadcastId: 'b1',
    toJid: `6281111111${String(index).padStart(2, '0')}@s.whatsapp.net`,
    name: `P${index}`,
    ref: `ref-${index}`,
    messageId: null,
    status: 'pending' as const,
    error: null,
  }))
}

const LOGGER = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as AppLogger
const JOB = { data: { sessionId: 's1', broadcastId: 'b1' } }

function createDeps(count = 2, sentToday = 0) {
  let status: BroadcastRow['status'] = 'pending'
  const broadcasts = {
    get: vi.fn(async () => ({ ...BROADCAST, status })),
    setStatus: vi.fn(async (_id: string, next: BroadcastRow['status']) => {
      status = next
    }),
    skipOptedOut: vi.fn(async () => undefined),
    pendingRecipients: vi.fn(async () => recipients(count)),
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

  return {
    broadcasts,
    messages,
    sessions,
    manager,
    setStatus: (next: BroadcastRow['status']) => {
      status = next
    },
  }
}

describe('processor broadcast-run', () => {
  it('mengirim semua penerima dan menandai done', async () => {
    const deps = createDeps()
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
      autoPauseRatio: 0.2,
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.markRecipient).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.markRecipient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'b1' }),
      expect.objectContaining({ id: 1 }),
      'sent',
      { messageId: 'm-628111111100@s.whatsapp.net' },
    )
    expect(deps.broadcasts.setStatus).toHaveBeenNthCalledWith(1, 'b1', 'running', expect.anything())
    expect(deps.broadcasts.setStatus).toHaveBeenLastCalledWith('b1', 'done', expect.anything())
  })

  it('menghentikan broadcast saat batas harian tercapai', async () => {
    const deps = createDeps(2, 200)
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
      autoPauseRatio: 0.2,
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).not.toHaveBeenCalled()
    expect(deps.broadcasts.markRecipient).toHaveBeenCalledTimes(2)
    expect(deps.broadcasts.markRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b1' }),
      expect.objectContaining({ id: 1 }),
      'failed',
      { error: 'Batas harian tercapai', emit: false },
    )
    expect(deps.broadcasts.setStatus).toHaveBeenLastCalledWith('b1', 'failed', expect.anything())
  })

  it('berhenti tanpa mengirim sisa penerima saat dijeda', async () => {
    const deps = createDeps()
    deps.manager.sendText = vi.fn(async () => {
      deps.setStatus('paused')
      return { key: { id: 'wa-1' } }
    }) as unknown as SessionManager['sendText']
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
      autoPauseRatio: 0.2,
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).toHaveBeenCalledTimes(1)
    expect(deps.broadcasts.setStatus).not.toHaveBeenLastCalledWith('b1', 'done', expect.anything())
  })

  it('menjeda otomatis saat tingkat gagal melewati ambang', async () => {
    const deps = createDeps(21)
    deps.manager.sendText = vi.fn(async () => {
      throw new Error('gagal')
    }) as unknown as SessionManager['sendText']
    const processor = createBroadcastRunProcessor({
      ...deps,
      logger: LOGGER,
      timezone: 'Asia/Jakarta',
      autoPauseRatio: 0.2,
    })

    await processor(JOB as never)

    expect(deps.manager.sendText).toHaveBeenCalledTimes(20)
    expect(deps.broadcasts.markRecipient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ id: 'b1' }),
      expect.objectContaining({ id: 1 }),
      'failed',
      { error: 'gagal', messageId: 'm-628111111100@s.whatsapp.net' },
    )
    expect(deps.broadcasts.setStatus).toHaveBeenLastCalledWith(
      'b1',
      'paused',
      expect.objectContaining({ pauseReason: expect.stringContaining('Tingkat gagal') }),
    )
  })
})
