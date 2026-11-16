import { randomBytes } from 'node:crypto'

import type {
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryDto,
  WebhookEndpointCreatedDto,
  WebhookEndpointDto,
} from '@wa/shared'
import { WEBHOOK_EVENT_TYPES } from '@wa/shared'

import { newId } from '../../db/id.js'
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../../db/schema.js'
import { NotFoundError, ValidationError } from '../errors.js'
import type { DeliveryCursor, WebhooksRepository } from './repository.js'

export type WebhooksService = ReturnType<typeof createWebhooksService>

function createSecret(): string {
  return randomBytes(32).toString('hex')
}

function validateUrl(value: string): string {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new ValidationError('URL webhook wajib HTTPS')
  }
  return url.toString()
}

function validateEvents(events: string[]): WebhookEndpointRow['events'] {
  const allowed = new Set<string>(WEBHOOK_EVENT_TYPES)
  if (events.some((event) => !allowed.has(event))) {
    throw new ValidationError('Jenis event webhook tidak dikenal')
  }
  return events as WebhookEndpointRow['events']
}

function toEndpointDto(row: WebhookEndpointRow): WebhookEndpointDto {
  return {
    id: row.id,
    url: row.url,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}

function toDeliveryDto(row: WebhookDeliveryRow): WebhookDeliveryDto {
  return {
    id: row.id,
    endpointId: row.endpointId,
    eventType: row.eventType,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt.toISOString(),
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }
}

function encodeCursor(cursor: DeliveryCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  )
}

function decodeCursor(value?: string): DeliveryCursor | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
    const [createdAt, id] = parsed
    if (typeof createdAt !== 'string' || typeof id !== 'string') return undefined
    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return undefined
    return { createdAt: date, id }
  } catch {
    return undefined
  }
}

export function createWebhooksService(repo: WebhooksRepository) {
  async function get(id: string): Promise<WebhookEndpointRow> {
    const row = await repo.findById(id)
    if (!row) throw new NotFoundError('Endpoint webhook tidak ditemukan')
    return row
  }

  return {
    async get(id: string): Promise<WebhookEndpointRow> {
      return get(id)
    },

    async list(): Promise<WebhookEndpointDto[]> {
      return (await repo.list()).map(toEndpointDto)
    },

    async create(input: CreateWebhookEndpointInput): Promise<WebhookEndpointCreatedDto> {
      const row: WebhookEndpointRow = {
        id: newId(),
        url: validateUrl(input.url),
        secret: createSecret(),
        events: validateEvents(input.events),
        active: input.active ?? true,
        createdAt: new Date(),
      }
      await repo.create(row)
      return { ...toEndpointDto(row), secret: row.secret }
    },

    async update(id: string, input: UpdateWebhookEndpointInput): Promise<WebhookEndpointDto> {
      const current = await get(id)
      const row: WebhookEndpointRow = {
        ...current,
        url: input.url === undefined ? current.url : validateUrl(input.url),
        events: input.events === undefined ? current.events : validateEvents(input.events),
        active: input.active ?? current.active,
      }
      await repo.update(id, { url: row.url, events: row.events, active: row.active })
      return toEndpointDto(row)
    },

    async remove(id: string): Promise<void> {
      await get(id)
      await repo.remove(id)
    },

    async rotateSecret(id: string): Promise<{ secret: string }> {
      await get(id)
      const secret = createSecret()
      await repo.update(id, { secret })
      return { secret }
    },

    async listDeliveries(
      id: string,
      limit: number,
      status?: WebhookDeliveryRow['status'],
      cursor?: string,
    ): Promise<{ items: WebhookDeliveryDto[]; nextCursor: string | null }> {
      await get(id)
      const page = await repo.listDeliveries(id, limit, status, decodeCursor(cursor))
      return {
        items: page.items.map(toDeliveryDto),
        nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
      }
    },
  }
}