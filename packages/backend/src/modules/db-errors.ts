export function isDuplicateKeyError(error: unknown): boolean {
  let current: unknown = error
  while (typeof current === 'object' && current !== null) {
    const candidate = current as { code?: string; errno?: number; cause?: unknown }
    if (candidate.code === 'ER_DUP_ENTRY' || candidate.errno === 1062) return true
    current = candidate.cause
  }
  return false
}
