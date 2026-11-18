import { sseEventSchema, type SseEvent } from '@wa/shared'
import { useEffect, useRef } from 'react'

import { getAuth } from './auth'
import { getEnv } from './env'

export function parseSseEvent(block: string): SseEvent | null {
  let id: string | undefined
  let event: string | undefined
  const data: string[] = []

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    const index = line.indexOf(':')
    const field = index >= 0 ? line.slice(0, index) : line
    const value = index >= 0 ? line.slice(index + 1).replace(/^ /, '') : ''
    if (field === 'id') id = value
    else if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }

  if (!id || !event || data.length === 0) return null
  try {
    const parsed = sseEventSchema.safeParse({ id, event, data: JSON.parse(data.join('\n')) })
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function useSessionEvents(
  sessionId: string | null,
  onEvent: (event: SseEvent) => void,
): void {
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  useEffect(() => {
    if (!sessionId) return
    const controller = new AbortController()
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    async function connect(): Promise<void> {
      try {
        const auth = getAuth()
        if (!auth) return
        const headers: Record<string, string> =
          auth.mode === 'admin'
            ? { 'x-api-key': auth.apiKey }
            : { authorization: `Bearer ${auth.token}` }
        const response = await fetch(
          `${getEnv().apiBaseUrl}/v1/sessions/${encodeURIComponent(sessionId as string)}/events`,
          { headers, signal: controller.signal },
        )
        if (!response.ok || !response.body) throw new Error('SSE tidak tersedia')

        attempt = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!closed) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const blocks = buffer.split(/\r?\n\r?\n/)
          buffer = blocks.pop() ?? ''
          for (const block of blocks) {
            const event = parseSseEvent(block)
            if (event) handlerRef.current(event)
          }
        }
      } catch {
        // Reconnect below; polling remains the fallback while the stream is down.
      }

      if (closed) return
      attempt += 1
      timer = setTimeout(() => void connect(), Math.min(30_000, 1000 * 2 ** attempt))
    }

    void connect()
    return () => {
      closed = true
      controller.abort()
      if (timer) clearTimeout(timer)
    }
  }, [sessionId])
}
