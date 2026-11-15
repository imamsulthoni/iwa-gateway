import { describe, expect, it } from 'vitest'

import { areJidsSameUser, isIgnoredJid, jidDecode, toUserJid } from './jid.js'

describe('utilitas JID', () => {
  it('menormalkan nomor ke JID user', () => {
    expect(toUserJid('08123456789')).toBe('628123456789@s.whatsapp.net')
    expect(toUserJid('+62 812 3456 789')).toBe('628123456789@s.whatsapp.net')
    expect(toUserJid('628123456789')).toBe('628123456789@s.whatsapp.net')
  })

  it('membedakan user dan grup', () => {
    expect(jidDecode('628123456789:7@s.whatsapp.net')).toEqual({
      user: '628123456789',
      server: 's.whatsapp.net',
    })
    expect(jidDecode('1203630@g.us')).toEqual({ user: '1203630', server: 'g.us' })
    expect(isIgnoredJid('1203630@g.us')).toBe(true)
    expect(isIgnoredJid('status@broadcast')).toBe(true)
    expect(isIgnoredJid('628123456789@s.whatsapp.net')).toBe(false)
  })

  it('membandingkan user JID tanpa device id', () => {
    expect(areJidsSameUser('628123456789:1@s.whatsapp.net', '628123456789@s.whatsapp.net')).toBe(
      true,
    )
    expect(areJidsSameUser('628123456789@s.whatsapp.net', '628999999999@s.whatsapp.net')).toBe(
      false,
    )
    expect(areJidsSameUser('bukan-jid', 'bukan-jid')).toBe(false)
  })
})
