import { useCallback, useEffect, useRef, useState } from 'react'

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value)
}

export function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function truncate(value: string, max = 80): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}

export function phoneFromJid(jid: string | null): string {
  if (!jid) return '-'
  return jid.split('@')[0]?.split(':')[0] ?? jid
}

export function formatPhone(value: string | null): string {
  if (!value) return '—'
  const digits = phoneFromJid(value).replace(/\D/g, '')
  if (!digits) return value
  if (digits.startsWith('62') && digits.length >= 10) {
    const rest = digits.slice(2)
    return `+62 ${rest.slice(0, 3)} ${rest.slice(3, 7)} ${rest.slice(7)}`.trim()
  }
  return `+${digits}`
}

export type PollingState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  refresh: () => void
  enabled: boolean
}

export function usePolling<T>(
  loader: () => Promise<T>,
  intervalMs: number,
  enabled = true,
): PollingState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const refresh = useCallback(() => {
    void loaderRef
      .current()
      .then((value) => {
        setData(value)
        setError(null)
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Gagal memuat data')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (enabled) refresh()
  }, [enabled, refresh])

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null

    function stop(): void {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }

    function start(): void {
      if (timer !== null) return
      if (typeof document !== 'undefined' && document.hidden) return
      timer = setInterval(refresh, intervalMs)
    }

    function onVisibility(): void {
      if (document.hidden) {
        stop()
        return
      }
      refresh()
      start()
    }

    start()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    return () => {
      stop()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [enabled, intervalMs, refresh])

  return { data, error, loading, refresh, enabled }
}
