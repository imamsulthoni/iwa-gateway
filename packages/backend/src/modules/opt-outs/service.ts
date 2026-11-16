import { newId } from '../../db/id.js'
import type { OptOutsRepository } from './repository.js'

export type OptOutsService = ReturnType<typeof createOptOutsService>

export const OPT_OUT_KEYWORDS = ['STOP', 'BERHENTI', 'UNSUBSCRIBE'] as const

export function isOptOutKeyword(body: string): boolean {
  return (OPT_OUT_KEYWORDS as readonly string[]).includes(body.trim().toUpperCase())
}

export function createOptOutsService(repo: OptOutsRepository) {
  return {
    async isOptedOut(phoneE164: string): Promise<boolean> {
      return (await repo.findByPhone(phoneE164)) !== null
    },

    async optedOutPhones(phones: string[]): Promise<Set<string>> {
      return repo.findOptedOutPhones(phones)
    },

    async recordKeyword(phoneE164: string | null, body: string): Promise<boolean> {
      if (!phoneE164 || !isOptOutKeyword(body)) return false
      await repo.insertIfAbsent({
        id: newId(),
        phoneE164,
        source: 'keyword',
        optedOutAt: new Date(),
      })
      return true
    },
  }
}
