import { describe, expect, it } from 'vitest'

import { createLogger } from './logger.js'

describe('logger redaksi', () => {
  it('tidak menulis nilai sensitif ke output', () => {
    const lines: string[] = []
    const logger = createLogger('info', {
      write(message: string) {
        lines.push(message)
      },
    })

    logger.info(
      {
        creds: { noiseKey: 'creds-rahasia' },
        value: 'value-rahasia',
        token: 'token-rahasia',
        apiKey: 'api-rahasia',
        authorization: 'Bearer rahasia',
        sessionId: 'sesi-1',
      },
      'uji redaksi',
    )

    const output = lines.join('\n')
    expect(output).toContain('[redacted]')
    expect(output).toContain('sesi-1')
    for (const secret of [
      'creds-rahasia',
      'value-rahasia',
      'token-rahasia',
      'api-rahasia',
      'Bearer rahasia',
    ]) {
      expect(output).not.toContain(secret)
    }
  })
})
