import { randomBytes } from 'node:crypto'

import { publicIdSchema, type SessionDto } from '@wa/shared'

import { newId } from '../../db/id.js'
import type { WaSessionRow } from '../../db/schema.js'
import { isDuplicateKeyError } from '../db-errors.js'
import { NotFoundError } from '../errors.js'
import { generateSessionToken, hashSessionToken } from '../auth/session-token.js'
import { DuplicatePhoneError, DuplicatePublicIdError, InvalidPublicIdError } from './errors.js'
import type { SessionsRepository } from './repository.js'

export type CreateSessionValues = {
  label: string
  publicId?: string
  phoneNumber?: string
  salesId?: string
  agentId?: string
  dailySendLimit?: number
}

export type SessionsService = ReturnType<typeof createSessionsService>

function generatePublicId(): string {
  return randomBytes(6).toString('hex')
}

export function toSessionDto(row: WaSessionRow): SessionDto {
  return {
    id: row.id,
    publicId: row.publicId,
    label: row.label,
    phoneNumber: row.phoneNumber,
    status: row.status,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    salesId: row.salesId,
    agentId: row.agentId,
    createdAt: row.createdAt.toISOString(),
  }
}

export function createSessionsService(repo: SessionsRepository) {
  async function get(id: string): Promise<WaSessionRow> {
    const row = await repo.findById(id)
    if (!row) {
      throw new NotFoundError('Sesi tidak ditemukan')
    }
    return row
  }

  return {
    get,

    async list(limit = 50): Promise<WaSessionRow[]> {
      return repo.list(limit)
    },

    async create(values: CreateSessionValues): Promise<{ session: WaSessionRow; token: string }> {
      const publicId = values.publicId ?? generatePublicId()
      if (!publicIdSchema.safeParse(publicId).success) {
        throw new InvalidPublicIdError()
      }
      if (await repo.findByPublicId(publicId)) {
        throw new DuplicatePublicIdError(publicId)
      }
      if (values.phoneNumber && (await repo.findByPhone(values.phoneNumber))) {
        throw new DuplicatePhoneError(values.phoneNumber)
      }

      const token = generateSessionToken()
      const id = newId()
      await repo.insert({
        id,
        publicId,
        label: values.label,
        phoneNumber: values.phoneNumber ?? null,
        status: 'created',
        tokenHash: hashSessionToken(token),
        salesId: values.salesId ?? null,
        agentId: values.agentId ?? null,
        dailySendLimit: values.dailySendLimit ?? 200,
      })
      return { session: await get(id), token }
    },

    async rotateToken(id: string): Promise<{ session: WaSessionRow; token: string }> {
      await get(id)
      const token = generateSessionToken()
      await repo.update(id, {
        tokenHash: hashSessionToken(token),
        tokenRotatedAt: new Date(),
      })
      return { session: await get(id), token }
    },

    async updateStatus(
      id: string,
      status: WaSessionRow['status'],
      patch: { lastQr?: null } = {},
    ): Promise<WaSessionRow> {
      await get(id)
      await repo.update(id, { status, ...patch })
      return get(id)
    },

    async setPhoneNumber(id: string, phoneNumber: string): Promise<WaSessionRow> {
      await get(id)
      try {
        await repo.update(id, { phoneNumber })
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          throw new DuplicatePhoneError(phoneNumber)
        }
        throw error
      }
      return get(id)
    },

    async remove(id: string): Promise<void> {
      await get(id)
      await repo.remove(id)
    },

    async startable(): Promise<WaSessionRow[]> {
      return repo.listStartable()
    },

    async listByStatus(status: WaSessionRow['status']): Promise<WaSessionRow[]> {
      return repo.listByStatus(status)
    },
  }
}
