import { afterEach, describe, expect, it, vi } from 'vitest'

import { newClientRef } from './client-ref.js'

describe('newClientRef', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('memakai randomUUID bila tersedia', () => {
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' })
    expect(newClientRef()).toBe('uuid-1')
  })

  it('memakai fallback saat randomUUID tidak tersedia', () => {
    vi.stubGlobal('crypto', {})
    expect(newClientRef()).toMatch(/^web-\d+-[a-z0-9]+$/)
  })

  it('memakai fallback saat crypto tidak tersedia', () => {
    vi.stubGlobal('crypto', undefined)
    expect(newClientRef()).toMatch(/^web-\d+-[a-z0-9]+$/)
  })

  it('menerima prefix khusus', () => {
    vi.stubGlobal('crypto', {})
    expect(newClientRef('bc')).toMatch(/^bc-\d+-[a-z0-9]+$/)
  })
})