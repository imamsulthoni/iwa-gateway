import { multistream, pino, type DestinationStream, type Logger } from 'pino'

export type AppLogger = Logger

export type LogRole = 'api' | 'worker'

const REDACT_PATHS = [
  'creds',
  '*.creds',
  'value',
  '*.value',
  'token',
  '*.token',
  'apiKey',
  '*.apiKey',
  'authorization',
  '*.authorization',
  'x-api-key',
  '*.x-api-key',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
]

export function createLogger(level = 'info', destination?: DestinationStream): AppLogger {
  const options = {
    level,
    base: undefined,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  }
  return destination ? pino(options, destination) : pino(options)
}

// LOG_DIR opsional: tanpa nilai, log tetap hanya ke stdout.
export function createRoleLogger(level: string, role: LogRole, dir?: string): AppLogger {
  if (!dir) return createLogger(level)
  // sync: true agar baris terakhir tidak hilang saat process.exit di shutdown.
  const file = pino.destination({ dest: `${dir}/${role}.log`, mkdir: true, sync: true })
  return createLogger(level, multistream([process.stdout, file]))
}
