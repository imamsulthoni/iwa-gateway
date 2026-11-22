import { describe, expect, it } from 'vitest'

import {
  CONSUMER_ENDPOINT_GROUPS,
  CONSUMER_ENDPOINT_METHODS,
  CONSUMER_ENDPOINTS,
} from './consumer-endpoints.js'

describe('CONSUMER_ENDPOINTS', () => {
  it('memakai method yang dikenal', () => {
    for (const endpoint of CONSUMER_ENDPOINTS) {
      expect(CONSUMER_ENDPOINT_METHODS).toContain(endpoint.method)
    }
  })

  it('memakai path absolut tanpa duplikat method + path', () => {
    const keys = CONSUMER_ENDPOINTS.map((endpoint) => {
      expect(endpoint.path.startsWith('/')).toBe(true)
      return `${endpoint.method} ${endpoint.path}`
    })

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('memakai grup dan auth yang dikenal', () => {
    for (const endpoint of CONSUMER_ENDPOINTS) {
      expect(CONSUMER_ENDPOINT_GROUPS).toContain(endpoint.group)
      expect(endpoint.auth).toBe('x-api-key')
      expect(endpoint.summary.length).toBeGreaterThan(0)
    }
  })

  it('tidak memuat endpoint dashboard internal', () => {
    const keys = CONSUMER_ENDPOINTS.map((endpoint) => `${endpoint.method} ${endpoint.path}`)

    for (const forbidden of ['/v1/auth', '/v1/settings', '/v1/stats']) {
      expect(keys.some((key) => key.endsWith(` ${forbidden}`))).toBe(false)
    }
    expect(keys.some((key) => key.includes(' /v1/auth/'))).toBe(false)
    expect(keys).not.toContain('GET /v1/messages')
    expect(keys.some((key) => key.includes(' /v1/messages/'))).toBe(false)
  })
})
