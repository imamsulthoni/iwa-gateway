import { describe, expect, it } from 'vitest'

import { readEnv } from './env.js'

describe('env web', () => {
  it('melempar saat VITE_API_BASE_URL kosong', () => {
    expect(() => readEnv({})).toThrow(/VITE_API_BASE_URL/)
  })

  it('menghapus trailing slash', () => {
    expect(readEnv({ VITE_API_BASE_URL: 'http://localhost:3000/' })).toEqual({
      apiBaseUrl: 'http://localhost:3000',
    })
  })
})
