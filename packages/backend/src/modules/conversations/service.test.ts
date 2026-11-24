import { describe, expect, it, vi } from 'vitest'

import type { ConversationRow } from '../../db/schema.js'
import { NotFoundError } from '../errors.js'
import type { ConversationsRepository } from './repository.js'
import { createConversationsService } from './service.js'

const CONVERSATION: ConversationRow = {
  id: 'c1',
  sessionId: 's1',
  waJid: '628123456789@s.whatsapp.net',
  waJidAlt: null,
  lastMessageAt: null,
  unreadCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createService(row: (ConversationRow & { customerNames?: string | null }) | null) {
  const repo = {
    findById: vi.fn(async () => row),
    findBySessionAndJid: vi.fn(async () => row),
    findBySessionAndAddress: vi.fn(async () => row),
    listRooms: vi.fn(async () => ({ items: row ? [row] : [], nextCursor: null })),
    listMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    markRead: vi.fn(async () => 0),
  } as unknown as ConversationsRepository
  return { service: createConversationsService(repo), repo }
}

describe('conversations service', () => {
  it('mengembalikan percakapan yang ditemukan', async () => {
    await expect(createService(CONVERSATION).service.get('c1')).resolves.toEqual(CONVERSATION)
  })

  it('melempar NotFoundError saat percakapan tidak ada', async () => {
    await expect(createService(null).service.get('c1')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('meneruskan nama customer gabungan ke DTO room', async () => {
    const { service } = createService({ ...CONVERSATION, customerNames: 'Andi, Anas' })
    const page = await service.listRooms('s1', 20)
    expect(page.items[0]?.customerNames).toBe('Andi, Anas')
  })

  it('mengembalikan DTO room dan reset unread saat dibaca', async () => {
    const { service, repo } = createService(CONVERSATION)

    await expect(service.listRooms('s1', 20)).resolves.toEqual({
      items: [
        {
          id: 'c1',
          sessionId: 's1',
          waJid: '628123456789@s.whatsapp.net',
          waJidAlt: null,
          lastMessageAt: null,
          unreadCount: 0,
          customerNames: null,
        },
      ],
      nextCursor: null,
    })
    await expect(service.markRead('c1')).resolves.toMatchObject({ unreadCount: 0 })
    expect(repo.markRead).toHaveBeenCalledWith('c1')
  })
})
