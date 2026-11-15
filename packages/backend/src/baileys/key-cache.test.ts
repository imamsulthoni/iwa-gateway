import { describe, expect, it } from 'vitest'

import { createKeyCache } from './key-cache.js'

describe('createKeyCache', () => {
  it('set lalu get mengembalikan nilai', () => {
    const cache = createKeyCache()
    cache.set('a', { x: 1 })
    expect(cache.get<{ x: number }>('a')).toEqual({ x: 1 })
  })

  it('get mengembalikan undefined untuk key yang belum di-set', () => {
    const cache = createKeyCache()
    expect(cache.get('tidak-ada')).toBeUndefined()
  })

  it('entri kedaluwarsa tidak dikembalikan', () => {
    const cache = createKeyCache(1)
    cache.set('a', 'nilai')
    const expired = new Promise((resolve) => setTimeout(resolve, 10))
    return expired.then(() => {
      expect(cache.get('a')).toBeUndefined()
    })
  })

  it('del menghapus satu entri', () => {
    const cache = createKeyCache()
    cache.set('a', 1)
    cache.set('b', 2)
    cache.del('a')
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
  })

  it('flushAll menghapus semua entri', () => {
    const cache = createKeyCache()
    cache.set('a', 1)
    cache.set('b', 2)
    cache.flushAll()
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBeUndefined()
  })
})
