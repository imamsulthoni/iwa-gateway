import { describe, expect, it } from 'vitest'

import { parseSseEvent } from './events'

describe('parseSseEvent', () => {
  it('membaca envelope id, event, dan data', () => {
    const event = parseSseEvent(
      [
        'event: message.received',
        'id: e1',
        'data: {"message":{"id":"m1","conversationId":"c1","sessionId":"s1","direction":"in","type":"text","body":"Halo","status":"delivered","clientRef":null,"waMessageId":"wa-1","createdAt":"2026-11-16T10:00:00.000Z"}}',
      ].join('\n'),
    )

    expect(event?.event).toBe('message.received')
    expect(event?.id).toBe('e1')
  })

  it('mengabaikan heartbeat dan payload rusak', () => {
    expect(parseSseEvent(': ping')).toBeNull()
    expect(parseSseEvent('event: message.received\ndata: bukan-json')).toBeNull()
  })
})
