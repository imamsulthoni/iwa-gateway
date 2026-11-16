import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createLogger, createRoleLogger } from './logger.js'

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

describe('logger file', () => {
  it('menulis JSON line ke <dir>/<role>.log dan tetap meredaksi secret', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wa-log-'))
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      const logger = createRoleLogger('info', 'worker', dir)
      logger.info({ sessionId: 'sesi-9', token: 'token-rahasia' }, 'tes file')

      const lines = readFileSync(join(dir, 'worker.log'), 'utf8').trim().split('\n')
      expect(lines).toHaveLength(1)
      const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>
      expect(entry.msg).toBe('tes file')
      expect(entry.sessionId).toBe('sesi-9')
      expect(entry.token).toBe('[redacted]')
    } finally {
      stdout.mockRestore()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
