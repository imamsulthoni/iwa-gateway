import { CONSUMER_ENDPOINTS } from '@wa/shared'
import { describe, expect, it } from 'vitest'

import { endpointResponse } from './api-guide.js'

describe('endpointResponse', () => {
  it('menyediakan contoh response untuk setiap endpoint consumer', () => {
    const missing = CONSUMER_ENDPOINTS.filter(
      (endpoint) => endpointResponse(endpoint) === null,
    ).map((endpoint) => `${endpoint.method} ${endpoint.path}`)

    expect(missing).toEqual([])
  })
})
