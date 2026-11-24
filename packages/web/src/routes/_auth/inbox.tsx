import { createFileRoute } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConversationList } from '../../components/inbox/ConversationList'
import { MessageThread } from '../../components/inbox/MessageThread'
import type { InboxRoom } from '../../components/inbox/model'
import { Banner, Button, PageHeader } from '../../design-system'
import { api } from '../../lib/api'
import { newClientRef } from '../../lib/client-ref'
import { useSessionEvents } from '../../lib/events'
import { formatPhone, usePolling } from '../../lib/format'
import type {
  ConversationDto,
  ConversationListDto,
  RoomMessageDto,
  RoomMessageListDto,
  SessionListDto,
} from '../../lib/types'

export const Route = createFileRoute('/_auth/inbox')({
  component: InboxPage,
})

const SESSION_POLL_MS = 20_000
const ROOM_POLL_MS = 15_000
const MESSAGE_POLL_MS = 10_000

type RoomFeed = {
  sessionId: string
  items: ConversationDto[]
}

function mergeLatest(current: RoomMessageDto[], incoming: RoomMessageDto[]): RoomMessageDto[] {
  const ids = new Set(incoming.map((row) => row.id))
  return [...incoming, ...current.filter((row) => !ids.has(row.id))]
}

function InboxPage() {
  const sessions = usePolling<SessionListDto>(
    () => api.get<SessionListDto>('/v1/sessions'),
    SESSION_POLL_MS,
  )
  const connectedSessions = useMemo(
    () => (sessions.data?.items ?? []).filter((item) => item.status === 'connected'),
    [sessions.data],
  )
  const feeds = usePolling<RoomFeed[]>(
    async () => {
      const pages = await Promise.all(
        connectedSessions.map(async (session) => ({
          sessionId: session.id,
          page: await api.get<ConversationListDto>(
            `/v1/sessions/${session.id}/conversations?limit=50`,
          ),
        })),
      )
      return pages.map(({ sessionId, page }) => ({ sessionId, items: page.items }))
    },
    ROOM_POLL_MS,
    connectedSessions.length > 0,
  )

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<RoomMessageDto[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const rooms = useMemo<InboxRoom[]>(() => {
    const items = sessions.data?.items ?? []
    const statusById = new Map(items.map((item) => [item.id, item.status]))
    const labelById = new Map(items.map((item) => [item.id, item.label]))
    return (feeds.data ?? [])
      .flatMap((feed) =>
        feed.items.map((item) => {
          const address = item.waJidAlt ?? item.waJid
          return {
            id: item.id,
            sessionId: feed.sessionId,
            sessionLabel: labelById.get(item.sessionId) ?? feed.sessionId,
            sessionStatus: statusById.get(item.sessionId) ?? 'disconnected',
            address: formatPhone(address),
            waJid: address,
            customerNames: item.customerNames,
            lastMessageAt: item.lastMessageAt,
            unreadCount: item.unreadCount,
          }
        }),
      )
      .sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''))
  }, [feeds.data, sessions.data])

  const visibleRooms = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rooms.filter((room) => {
      if (filter === 'unread' && room.unreadCount === 0) return false
      if (filter !== 'all' && filter !== 'unread' && room.sessionId !== filter) return false
      if (!needle) return true
      return `${room.address} ${room.waJid} ${room.customerNames ?? ''} ${room.sessionId}`
        .toLowerCase()
        .includes(needle)
    })
  }, [filter, query, rooms])

  const filters = useMemo(() => {
    const sessionIds = [...new Set(rooms.map((room) => room.sessionId))]
    const labels = new Map((sessions.data?.items ?? []).map((item) => [item.id, item.label]))
    return [
      { value: 'all', label: 'SEMUA' },
      { value: 'unread', label: 'BELUM DIBACA' },
      ...sessionIds.map((id) => ({ value: id, label: labels.get(id) ?? id })),
    ]
  }, [rooms, sessions.data])

  const selectedRoom = rooms.find((room) => room.id === conversationId) ?? null
  const unreadTotal = rooms.reduce((total, room) => total + room.unreadCount, 0)

  useEffect(() => {
    if (conversationId && rooms.some((room) => room.id === conversationId)) return
    setConversationId(rooms[0]?.id ?? null)
  }, [conversationId, rooms])

  const loadLatest = useCallback(async (id: string) => {
    const page = await api.get<RoomMessageListDto>(`/v1/conversations/${id}/messages?limit=50`)
    setMessages((current) => mergeLatest(current, page.items))
    setNextCursor(page.nextCursor)
  }, [])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setNextCursor(null)
      setLoading(false)
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
    }, MESSAGE_POLL_MS)
    return () => clearInterval(timer)
  }, [conversationId, loadLatest])

  useEffect(() => {
    if (!conversationId) return
    void api
      .post(`/v1/conversations/${conversationId}/read`)
      .then(() => feeds.refresh())
      .catch(() => undefined)
  }, [conversationId, feeds.refresh])

  useSessionEvents(selectedRoom?.sessionId ?? null, (event) => {
    if (event.event === 'message.received') {
      feeds.refresh()
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
    if (!selectedRoom || !text) return

    setSending(true)
    setError(null)
    try {
      await api.post('/v1/messages', {
        sessionId: selectedRoom.sessionId,
        to: selectedRoom.waJid,
        text,
        clientRef: newClientRef(),
      })
      setDraft('')
      await loadLatest(selectedRoom.id)
      feeds.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengirim pesan')
    } finally {
      setSending(false)
    }
  }

  function refreshAll() {
    sessions.refresh()
    feeds.refresh()
    if (conversationId) void loadLatest(conversationId).catch(() => undefined)
  }

  const connectedCount = connectedSessions.length
  const noNumbers = !sessions.loading && connectedCount === 0
  const listEmpty = noNumbers
    ? 'Belum ada nomor WhatsApp untuk akun ini. Hubungi admin.'
    : rooms.length === 0
      ? 'Belum ada percakapan. Pesan masuk akan muncul di sini.'
      : 'Tidak ada percakapan yang cocok.'

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col gap-6">
      <PageHeader
        eyebrow="INBOX / PERCAKAPAN"
        title="Kotak masuk"
        description={`Percakapan masuk dari ${connectedCount} nomor terhubung.`}
        actions={
          <>
            <p className="font-data text-[9.5px] text-ink-faint">{unreadTotal} belum dibaca</p>
            <Button variant="secondary" size="sm" onClick={refreshAll}>
              <RefreshCw className="size-3.5" aria-hidden />
              Segarkan
            </Button>
          </>
        }
      />

      {(error ?? feeds.error ?? sessions.error) ? (
        <Banner tone="danger">{error ?? feeds.error ?? sessions.error}</Banner>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-4">
        <ConversationList
          rooms={visibleRooms}
          total={rooms.length}
          selectedId={conversationId}
          onSelect={setConversationId}
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          filters={filters}
          unreadTotal={unreadTotal}
          loading={sessions.loading || (connectedCount > 0 && feeds.loading && !feeds.data)}
          emptyText={listEmpty}
        />

        <MessageThread
          room={selectedRoom}
          messages={messages}
          loading={loading}
          loadingMore={loadingMore}
          hasMore={Boolean(nextCursor)}
          onLoadMore={() => void loadMore()}
          draft={draft}
          onDraft={setDraft}
          onSend={() => void send()}
          sending={sending}
          emptyText={
            noNumbers
              ? 'Belum ada nomor untuk akun ini. Hubungi admin.'
              : 'Pilih percakapan untuk melihat isi chat.'
          }
        />
      </div>
    </div>
  )
}
