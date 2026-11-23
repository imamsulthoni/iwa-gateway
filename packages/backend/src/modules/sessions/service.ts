import { randomBytes } from 'node:crypto'

import { publicIdSchema, type SessionDto } from '@wbc/shared'

import { newId } from '../../db/id.js'
import type { WaSessionRow } from '../../db/schema.js'
import { isDuplicateKeyError } from '../db-errors.js'
import {
  ConflictError,
  NotFoundError,
  SalesLimitReachedError,
  ValidationError,
} from '../errors.js'
import { generateSessionToken, hashSessionToken } from '../auth/session-token.js'
import { hashPin } from '../auth/pin.js'
import type { SettingsService } from '../settings/service.js'
import { DuplicatePhoneError, DuplicatePublicIdError, InvalidPublicIdError } from './errors.js'
import type { SessionsRepository, SessionWithOwner } from './repository.js'

export type CreateSessionValues = {
  label: string
  publicId?: string
  phoneNumber?: string
  salesId?: string
  agentId?: string
  salesName?: string
  pin?: string
  dailySendLimit?: number
}

export type AttachSalesValues = {
  salesName: string
  pin: string
}

export type SessionsService = ReturnType<typeof createSessionsService>

function generatePublicId(): string {
  return randomBytes(6).toString('hex')
}

export function toSessionDto(row: WaSessionRow & { salesName?: string | null }): SessionDto {
  return {
    id: row.id,
    publicId: row.publicId,
    label: row.label,
    phoneNumber: row.phoneNumber,
    status: row.status,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    salesId: row.salesId,
    agentId: row.agentId,
    salesName: row.salesName ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

export function createSessionsService(
  repo: SessionsRepository,
  settings: Pick<SettingsService, 'getSettings'>,
) {
  async function get(id: string): Promise<SessionWithOwner> {
    const row = await repo.findById(id)
    if (!row) {
      throw new NotFoundError('Sesi tidak ditemukan')
    }
    return row
  }

  return {
    get,

    async list(limit = 50, ownerUserId?: string): Promise<SessionWithOwner[]> {
      return repo.list(limit, ownerUserId)
    },

    async create(
      values: CreateSessionValues,
    ): Promise<{ session: SessionWithOwner; token: string }> {
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
      const session: Parameters<SessionsRepository['insert']>[0] = {
        id,
        publicId,
        label: values.label,
        phoneNumber: values.phoneNumber ?? null,
        status: 'created',
        tokenHash: hashSessionToken(token),
        salesId: values.salesId ?? null,
        agentId: values.agentId ?? null,
        dailySendLimit: values.dailySendLimit ?? 200,
      }

      const createsSales = values.salesName !== undefined || values.pin !== undefined
      if (createsSales) {
        if (!values.salesName || !values.pin || !values.phoneNumber) {
          throw new ValidationError('Nama sales, PIN, dan nomor WhatsApp wajib diisi bersama')
        }
        // shortcut: kuota dibaca sebelum transaksi, dua create bersamaan bisa lolos 1 di atas
        // batas; tambah lock bila enforcement harus ketat.
        const { maxSales, salesCount } = await settings.getSettings()
        if (salesCount >= maxSales) throw new SalesLimitReachedError()

        const userId = newId()
        try {
          await repo.insertWithOwner(
            {
              id: userId,
              name: values.salesName,
              phoneNumber: values.phoneNumber,
              role: 'sales',
              pinHash: hashPin(values.pin),
            },
            { ...session, ownerUserId: userId },
          )
        } catch (error) {
          if (isDuplicateKeyError(error)) throw new DuplicatePhoneError(values.phoneNumber)
          throw error
        }
      } else {
        await repo.insert(session)
      }
      return { session: await get(id), token }
    },

    async rotateToken(id: string): Promise<{ session: SessionWithOwner; token: string }> {
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
    ): Promise<SessionWithOwner> {
      await get(id)
      await repo.update(id, { status, ...patch })
      return get(id)
    },

    async setPhoneNumber(id: string, phoneNumber: string): Promise<SessionWithOwner> {
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
      const session = await get(id)
      await repo.remove(id)
      // Satu akun sales = satu nomor; hapus akun agar kuota kembali dan nomor tidak bisa login.
      if (session.ownerUserId) await repo.deleteUser(session.ownerUserId)
    },

    async resetSalesPin(id: string, pin: string): Promise<SessionWithOwner> {
      const session = await get(id)
      if (!session.ownerUserId) throw new ConflictError('Sesi ini belum memiliki akun sales')
      await repo.updateUser(session.ownerUserId, { pinHash: hashPin(pin) })
      await repo.revokeUserTokens(session.ownerUserId)
      return get(id)
    },

    async attachSales(id: string, values: AttachSalesValues): Promise<SessionWithOwner> {
      const session = await get(id)
      if (session.ownerUserId) throw new ConflictError('Sesi sudah memiliki akun sales')
      if (!session.phoneNumber) throw new ValidationError('Sesi belum memiliki nomor WhatsApp')

      const pinHash = hashPin(values.pin)
      const existing = await repo.findUserByPhone(session.phoneNumber)
      if (existing) {
        if (existing.role !== 'sales') throw new ConflictError('Nomor sudah dipakai akun lain')
        if (await repo.findOwnedSession(existing.id)) {
          throw new ConflictError('Nomor sudah dipakai sesi lain')
        }
        await repo.updateUser(existing.id, { name: values.salesName, pinHash })
        await repo.revokeUserTokens(existing.id)
        await repo.update(id, { ownerUserId: existing.id })
        return get(id)
      }

      // shortcut: kuota dibaca sebelum insert, dua attach bersamaan bisa lolos 1 di atas
      // batas; tambah lock bila enforcement harus ketat.
      const { maxSales, salesCount } = await settings.getSettings()
      if (salesCount >= maxSales) throw new SalesLimitReachedError()

      try {
        await repo.insertOwner(
          {
            id: newId(),
            name: values.salesName,
            phoneNumber: session.phoneNumber,
            role: 'sales',
            pinHash,
          },
          id,
        )
      } catch (error) {
        if (isDuplicateKeyError(error)) throw new ConflictError('Nomor sudah dipakai akun lain')
        throw error
      }
      return get(id)
    },

    async startable(): Promise<WaSessionRow[]> {
      return repo.listStartable()
    },

    async listByStatus(status: WaSessionRow['status']): Promise<WaSessionRow[]> {
      return repo.listByStatus(status)
    },
  }
}
