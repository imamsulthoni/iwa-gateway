import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge, Banner, Button, PageHeader, Select, Textarea, cn } from '../../design-system'
import { api } from '../../lib/api'
import { newClientRef } from '../../lib/client-ref'
import { useSessionEvents } from '../../lib/events'
import { formatPhone, usePolling } from '../../lib/format'
import type {
  ConversationListDto,
  RoomMessageDto,
  RoomMessageListDto,
  SessionListDto,
} from '../../lib/types'

export const Route = createFileRoute('/_auth/inbox')({
  component: InboxPage,
})

const TYPE_LABELS: Record<string, string> = {
  image: 'Gambar',
  video: 'Video',
  audio: 'Audio',
  document: 'Dokumen',
  sticker: 'Stiker',
  location: 'Lokasi',
  contact: 'Kontak',
  poll: 'Polling',
  reaction: 'Reaksi',
  unknown: 'Pesan',
}

function label(row: RoomMessageDto): string {
  if (row.type === 'text') return row.body ?? ''
  return TYPE_LABELS[row.type] ?? row.type
}

function clock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function mergeLatest(current: RoomMessageDto[], incoming: RoomMessageDto[]): RoomMessageDto[] {
  const ids = new Set(incoming.map((row) => row.id))
  return [...incoming, ...current.filter((row) => !ids.has(row.id))]
}

function InboxPage() {
  const sessions = usePolling<SessionListDto>(() => api.get<SessionListDto>('/sessions'), 20_000)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<RoomMessageDto[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rooms = usePolling<ConversationListDto>(
    () =>
      sessionId
        ? api.get<ConversationListDto>(`/v1/sessions/${sessionId}/conversations?limit=50`)
        : Promise.resolve({ items: [], nextCursor: null }),
    15_000,
    Boolean(sessionId),
  )

  useEffect(() => {
    if (sessionId) return
    const first = sessions.data?.items[0]
    if (first) setSessionId(first.publicId)
  }, [sessionId, sessions.data])

  useEffect(() => {
    if (conversationId) return
    const internalId = sessions.data?.items.find((item) => item.publicId === sessionId)?.id
    const first = rooms.data?.items.find((room) => room.sessionId === internalId)
    if (first) setConversationId(first.id)
  }, [conversationId, rooms.data, sessionId, sessions.data])

  const loadLatest = useCallback(async (id: string) => {
    const page = await api.get<RoomMessageListDto>(`/v1/conversations/${id}/messages?limit=50`)
    setMessages((current) => mergeLatest(current, page.items))
    setNextCursor(page.nextCursor)
  }, [])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setNextCursor(null)
      return
    }
    setMessages([])
    setNextCursor(null)
    setLoading(true)
    void loadLatest(conversationId)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Gagal memuat pesan'),
      )
      .finally(() => setLoading(false))

    const timer = setInterval(() => {
      void loadLatest(conversationId).catch(() => undefined)
    }, 10_000)
    return () => clearInterval(timer)
  }, [conversationId, loadLatest])

  useEffect(() => {
    if (!conversationId) return
    void api
      .post(`/v1/conversations/${conversationId}/read`)
      .then(() => rooms.refresh())
      .catch(() => undefined)
  }, [conversationId, rooms.refresh])

  useSessionEvents(sessionId, (event) => {
    if (event.event === 'message.received') {
      rooms.refresh()
      if (event.data.message.conversationId === conversationId) {
        void loadLatest(event.data.message.conversationId).catch(() => undefined)
      }
      return
    }
    if (event.event === 'message.status') {
      setMessages((current) =>
        current.map((row) =>
          row.id === event.data.messageId ? { ...row, status: event.data.status } : row,
        ),
      )
    }
  })

  const selectedSession = sessions.data?.items.find((item) => item.publicId === sessionId)
  const roomItems = (rooms.data?.items ?? []).filter(
    (room) => room.sessionId === selectedSession?.id,
  )
  const selectedRoom = roomItems.find((room) => room.id === conversationId)
  const waAddress = selectedRoom?.waJidAlt ?? selectedRoom?.waJid ?? null
  const threads = [...messages].reverse()

  async function loadMore() {
    if (!conversationId || !nextCursor) return
    setLoadingMore(true)
    try {
      const page = await api.get<RoomMessageListDto>(
        `/v1/conversations/${conversationId}/messages?limit=50&cursor=${encodeURIComponent(nextCursor)}`,
      )
      setMessages((current) => {
        const ids = new Set(current.map((row) => row.id))
        return [...current, ...page.items.filter((row) => !ids.has(row.id))]
      })
      setNextCursor(page.nextCursor)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat pesan lama')
    } finally {
      setLoadingMore(false)
    }
  }

  async function send() {
    const text = draft.trim()
    if (!sessionId || !selectedRoom || !waAddress || !text) return
    setSending(true)
    setError(null)
    try {
      await api.post('/v1/messages', {
        sessionId,
        to: waAddress,
        text,
        clientRef: newClientRef(),
      })
      setDraft('')
      await loadLatest(selectedRoom.id)
      rooms.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengirim pesan')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col gap-5">
      <PageHeader
        eyebrow="INBOX / ROOMS"
        title="Inbox"
        description="Percakapan teks per nomor WhatsApp. Media hanya dicatat jenisnya."
        actions={
          <>
            <Select
              aria-label="Pilih sesi"
              value={sessionId ?? ''}
              onChange={(event) => {
                setSessionId(event.target.value)
                setConversationId(null)
              }}
              className="h-[34px] w-[190px] text-small"
            >
              {sessions.data?.items.map((item) => (
                <option key={item.publicId} value={item.publicId}>
                  {item.label} · {item.status}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              onClick={() => {
                rooms.refresh()
                if (conversationId) void loadLatest(conversationId)
              }}
            >
              <RefreshCw className="size-3.5" aria-hidden />
              Segarkan
            </Button>
          </>
        }
      />

      {(error ?? rooms.error) ? <Banner tone="danger">{error ?? rooms.error}</Banner> : null}

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="flex w-[300px] shrink-0 flex-col rounded-card border border-line bg-surface">
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-body font-semibold text-ink">Room chat</p>
            <p className="font-data text-[9.5px] text-ink-faint">
              {selectedSession?.publicId ?? '—'}
            </p>
          </div>
          <div className="h-px bg-line" />
          <div className="min-h-0 flex-1 overflow-auto">
            {rooms.loading && !rooms.data ? (
              <p className="px-4 py-10 text-center text-small text-ink-faint">Memuat room...</p>
            ) : null}
            {rooms.data && roomItems.length === 0 ? (
              <p className="px-4 py-10 text-center text-small text-ink-faint">
                Belum ada percakapan. Pesan masuk akan muncul di sini.
              </p>
            ) : null}
            {roomItems.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setConversationId(room.id)}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition last:border-0 hover:bg-surface-soft',
                  room.id === conversationId && 'bg-surface-soft',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-body font-medium text-ink">
                    {formatPhone(room.waJidAlt ?? room.waJid)}
                  </span>
                  {room.unreadCount > 0 ? <Badge tone="warning">{room.unreadCount}</Badge> : null}
                </span>
                <span className="font-data text-[9px] text-ink-faint">
                  {room.lastMessageAt ? clock(room.lastMessageAt) : '—'} · {room.waJid}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-w-0 flex-1 flex-col rounded-card border border-line bg-surface">
          {selectedRoom ? (
            <>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-body font-semibold text-ink">{formatPhone(waAddress)}</p>
                  <p className="font-data text-[9px] text-ink-faint">{selectedRoom.waJid}</p>
                </div>
                <Badge tone={selectedRoom.unreadCount > 0 ? 'warning' : 'neutral'}>
                  {selectedRoom.unreadCount > 0
                    ? `${selectedRoom.unreadCount} belum dibaca`
                    : 'Dibaca'}
                </Badge>
              </div>
              <div className="h-px bg-line" />

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 py-4">
                {nextCursor ? (
                  <Button
                    variant="secondary"
                    className="mx-auto h-7 px-3 text-[11px]"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? 'Memuat...' : 'Muat lebih'}
                  </Button>
                ) : null}
                {loading && messages.length === 0 ? (
                  <p className="py-10 text-center text-small text-ink-faint">Memuat pesan...</p>
                ) : null}
                {!loading && messages.length === 0 ? (
                  <p className="py-10 text-center text-small text-ink-faint">
                    Belum ada pesan di room ini.
                  </p>
                ) : null}
                {threads.map((row) => (
                  <div
                    key={row.id}
                    className={cn('flex flex-col gap-0.5', row.direction === 'out' && 'items-end')}
                  >
                    <div
                      className={cn(
                        'max-w-[70%] rounded-lg px-3 py-2 text-small',
                        row.direction === 'out' ? 'bg-ink text-white' : 'bg-surface-soft text-ink',
                      )}
                    >
                      {label(row) || '—'}
                    </div>
                    <span className="font-data text-[8.5px] text-ink-faint">
                      {clock(row.createdAt)} · {row.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-end gap-2 border-t border-line p-3">
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void send()
                    }
                  }}
                  placeholder="Tulis balasan..."
                  aria-label="Tulis balasan"
                  className="min-h-[42px] flex-1 resize-none"
                  rows={2}
                />
                <Button disabled={sending || !draft.trim()} onClick={() => void send()}>
                  <Send className="size-3.5" aria-hidden />
                  {sending ? 'Mengirim...' : 'Kirim'}
                </Button>
              </div>
            </>
          ) : (
            <p className="m-auto px-6 text-center text-small text-ink-faint">
              Pilih room chat untuk melihat percakapan.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
