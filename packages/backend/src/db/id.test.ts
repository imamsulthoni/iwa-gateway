import { describe, expect, it } from 'vitest'

import { newId } from './id.js'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  it('menghasilkan UUIDv7 unik', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(UUID_V7)
  })

  it('terurut menurut waktu pembuatan', () => {
    const first = newId()
    const second = newId()
    expect(second > first).toBe(true)
  })
})
