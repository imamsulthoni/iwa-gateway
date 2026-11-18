import { describe, expect, it } from 'vitest'

import {
  BROADCAST_STATUS_LABELS,
  BROADCAST_STATUSES,
  MESSAGE_STATUS_LABELS,
  MESSAGE_STATUSES,
  RECIPIENT_STATUS_LABELS,
  RECIPIENT_STATUSES,
  SESSION_STATUS_LABELS,
  SESSION_STATUSES,
  USER_ROLES,
} from './status.js'

describe('label status', () => {
  it('setiap status sesi punya label UI', () => {
    for (const status of SESSION_STATUSES) {
      expect(SESSION_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  it('setiap status pesan punya label UI', () => {
    for (const status of MESSAGE_STATUSES) {
      expect(MESSAGE_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  it('setiap status broadcast punya label UI', () => {
    for (const status of BROADCAST_STATUSES) {
      expect(BROADCAST_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  it('setiap status penerima punya label UI', () => {
    for (const status of RECIPIENT_STATUSES) {
      expect(RECIPIENT_STATUS_LABELS[status]).toBeTruthy()
    }
  })

  it('role user hanya admin dan sales', () => {
    expect(USER_ROLES).toEqual(['admin', 'sales'])
  })
})
