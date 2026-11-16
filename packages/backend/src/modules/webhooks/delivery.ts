import { createHmac } from 'node:crypto'

export const MAX_WEBHOOK_ATTEMPTS = 3
const RETRY_BASE_MS = 10_000

export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function retryDelayMs(attempts: number): number {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)
}