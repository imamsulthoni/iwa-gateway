// crypto.randomUUID hanya ada di secure context (https/localhost). Fallback ini
// menjaga pengiriman tetap jalan saat dashboard dibuka lewat http://<ip-lan>.
export function newClientRef(prefix = 'web'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}