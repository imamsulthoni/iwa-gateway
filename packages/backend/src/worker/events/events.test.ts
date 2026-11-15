import { describe, expect, it } from 'vitest'

import { DisconnectReason } from '@whiskeysockets/baileys'

import { parseConnectionUpdate } from './connection.js'
import { parseMessagesUpdate } from './messages-update.js'

describe('parseConnectionUpdate', () => {
  it('mengenali QR', () => {
    expect(parseConnectionUpdate({ qr: 'qr-string' })).toEqual({ kind: 'qr', qr: 'qr-string' })
  })

  it('mengenali koneksi terbuka', () => {
    expect(parseConnectionUpdate({ connection: 'open' })).toEqual({ kind: 'open' })
  })

  it('mengenali logout dari status code', () => {
    expect(
      parseConnectionUpdate({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: DisconnectReason.loggedOut } } },
      }),
    ).toEqual({ kind: 'close', loggedOut: true, statusCode: DisconnectReason.loggedOut })
  })

  it('mengenali putus sementara', () => {
    expect(
      parseConnectionUpdate({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 428 } } },
      }),
    ).toEqual({ kind: 'close', loggedOut: false, statusCode: 428 })
  })

  it('mengabaikan update lain', () => {
    expect(parseConnectionUpdate({ connection: 'connecting' })).toBeNull()
  })
})

describe('parseMessagesUpdate', () => {
  it('mengambil id dan status', () => {
    expect(
      parseMessagesUpdate([
        { key: { id: 'm1' }, update: { status: 3 } },
        { key: { id: 'm2' }, update: {} },
        { key: {} },
        null,
      ]),
    ).toEqual([
      { waMessageId: 'm1', status: 3 },
      { waMessageId: 'm2', status: null },
    ])
  })

  it('mengembalikan daftar kosong untuk input bukan array', () => {
    expect(parseMessagesUpdate({})).toEqual([])
  })
})
