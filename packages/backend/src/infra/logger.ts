import { pino, type DestinationStream, type Logger } from 'pino'

export type AppLogger = Logger

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
