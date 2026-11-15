export type WebEnv = {
  apiBaseUrl: string
}

export function readEnv(source: { VITE_API_BASE_URL?: string }): WebEnv {
  const value = source.VITE_API_BASE_URL
  if (!value) {
    throw new Error('VITE_API_BASE_URL belum diisi di .env root')
  }
  return { apiBaseUrl: value.replace(/\/+$/, '') }
}

let cached: WebEnv | undefined

export function getEnv(): WebEnv {
  cached ??= readEnv(import.meta.env as { VITE_API_BASE_URL?: string })
  return cached
}
