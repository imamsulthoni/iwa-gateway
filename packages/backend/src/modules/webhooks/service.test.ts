import { describe, expect, it, vi } from 'vitest'

import type { WebhookEndpointRow } from '../../db/schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import type { WebhooksRepository } from './repository.js'
import { createWebhooksService } from './service.js'

const ENDPOINT: WebhookEndpointRow = {
  id: 'w1',
  url: 'https://example.com/webhook',
  secret: 'secret',
  events: ['message.status'],
  active: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

function createService(overrides: Partial<Record<keyof WebhooksRepository, unknown>> = {}) {
  const repo = {
    findById: vi.fn(async () => ENDPOINT),
    list: vi.fn(async () => [ENDPOINT]),
    findActive: vi.fn(async () => [ENDPOINT]),
    create: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    createDeliveries: vi.fn(async () => undefined),
    listDeliveries: vi.fn(async () => ({ items: [], nextCursor: null })),
    ...overrides,
  } as unknown as WebhooksRepository
  return { service: createWebhooksService(repo), repo }
}

describe('webhooks service', () => {
  it('mengembalikan endpoint yang ditemukan', async () => {
    await expect(createService().service.get('w1')).resolves.toEqual(ENDPOINT)
  })

  it('melempar NotFoundError saat endpoint tidak ada', async () => {
    const { service } = createService({ findById: vi.fn(async () => null) })
    await expect(service.get('w1')).rejects.toBeInstanceOf(NotFoundError)
  })

  it('tidak mengembalikan secret di daftar endpoint', async () => {
    const [endpoint] = await createService().service.list()
    expect(endpoint).not.toHaveProperty('secret')
    expect(endpoint).toMatchObject({ id: 'w1', url: ENDPOINT.url, active: true })
  })

  it('membuat secret server dan hanya mengembalikannya saat create', async () => {
    const { service, repo } = createService()
    const created = await service.create({
      url: 'https://example.com/new',
      events: ['message.received'],
    })

    expect(created.secret).toHaveLength(64)
    expect(created.id).toBeTruthy()
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com/new', secret: created.secret }),
    )
  })

  it('menolak URL HTTP non-loopback', async () => {
    const { service } = createService()
    await expect(
      service.create({ url: 'http://example.com/hook', events: ['message.status'] }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('mengizinkan HTTP loopback untuk pengujian lokal', async () => {
    const { service } = createService()
    await expect(
      service.create({ url: 'http://127.0.0.1:9999/hook', events: ['message.status'] }),
    ).resolves.toMatchObject({ url: 'http://127.0.0.1:9999/hook' })
  })

  it('merotasi secret menjadi nilai baru', async () => {
    const { service, repo } = createService()
    const result = await service.rotateSecret('w1')

    expect(result.secret).toHaveLength(64)
    expect(result.secret).not.toBe(ENDPOINT.secret)
    expect(repo.update).toHaveBeenCalledWith('w1', { secret: result.secret })
  })

  it('tidak mengembalikan secret saat update', async () => {
    const { service } = createService()
    await expect(service.update('w1', { active: false })).resolves.not.toHaveProperty('secret')
  })
})