import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { retryDelayMs, signWebhook } from './delivery.js'

describe('webhook delivery', () => {
  it('menandatangani body dengan HMAC-SHA256', () => {
    const body = '{"type":"message.status"}'
    const expected = createHmac('sha256', 'secret').update(body).digest('hex')
    expect(signWebhook('secret', body)).toBe(`sha256=${expected}`)
  })

  it('memakai backoff eksponensial', () => {
    expect(retryDelayMs(1)).toBe(10_000)
    expect(retryDelayMs(2)).toBe(20_000)
  })

  it('signature berbeda bila secret salah', () => {
    const body = '{"type":"message.status"}'
    expect(signWebhook('salah', body)).not.toBe(signWebhook('secret', body))
  })
})