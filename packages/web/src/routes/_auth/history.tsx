import { MESSAGE_STATUS_LABELS } from '@wa/shared'
import { createFileRoute } from '@tanstack/react-router'
import { ListFilter, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '../../components/dialogs'
import { Badge, Button, cn } from '../../design-system'
import type { BadgeTone } from '../../design-system'
import { api } from '../../lib/api'
import { formatPhone, truncate } from '../../lib/format'
import type { MessageListDto } from '../../lib/types'

export const Route = createFileRoute('/_auth/history')({
  validateSearch: (search: Record<string, unknown>): { sessionId?: string } => {
    const sessionId = search.sessionId
    if (typeof sessionId === 'string' && sessionId.trim()) {
      return { sessionId: sessionId.trim() }
    }
    return {}
  },
  component: HistoryPage,
})

const GRID = 'grid grid-cols-[96px_150px_128px_120px_minmax(0,1fr)_104px_40px] items-center'
const COL_HEAD = 'font-data text-[9px] tracking-[1.1px] text-ink-soft uppercase'

function tone(status: string): BadgeTone {
  if (status === 'failed') return 'danger'
  if (status === 'queued') return 'neutral'
  return 'success'
}

function clock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function day(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(date)
}

function key(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toDateString()
}

function HistoryPage() {
  const { sessionId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [rows, setRows] = useState<MessageListDto['items']>([])
  const [draft, setDraft] = useState(sessionId ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(
    async (filterSessionId?: string) => {
      setLoading(true)
      setError(null)
      try {
        const query = new URLSearchParams({ limit: '50' })
        if (filterSessionId) query.set('sessionId', filterSessionId)
        const page = await api.get<MessageListDto>(`/messages?${query.toString()}`)
        setRows(page.items)
        setLoaded(true)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Gagal memuat riwayat')
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load(sessionId)
  }, [load, sessionId])

  const days = useMemo(() => new Set(rows.map((row) => key(row.createdAt))).size, [rows])

  function refresh() {
    void load(sessionId)
  }

  function applyFilter() {
    const next = draft.trim()
    void navigate({ search: next ? { sessionId: next } : {} })
  }

  async function remove() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/messages/${deleteId}`)
      setRows((previous) => previous.filter((row) => row.id !== deleteId))
      setDeleteId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus riwayat')
    } finally {
      setDeleting(false)
    }
  }


  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-data text-[9.5px] tracking-[1.6px] text-ink-faint uppercase">
            RIWAYAT / OUTGOING
          </p>
          <h1 className="text-heading text-ink">Riwayat pesan</h1>
          <p className="text-body text-ink-soft">Semua pesan keluar dari seluruh sesi.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <p className="font-data text-[9.5px] text-ink-faint">
            {rows.length} pesan · {days} hari
          </p>
          <Button
            variant="secondary"
            className="h-[34px] gap-[7px] px-3.5 text-[12.5px]"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw className="size-[13px] text-ink-soft" aria-hidden />
            Segarkan
          </Button>
        </div>
      </div>

      <section className="flex min-h-0 flex-1 flex-col rounded-card border border-line bg-surface pt-5">
        <div className="flex items-center justify-between px-[22px]">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Pesan keluar</h2>
            <p className="text-small text-ink-faint">
              50 pesan terakhir, urut dari yang paling baru.
            </p>
          </div>
        </div>

        <div className="h-4" />

        <div className="flex items-center justify-between gap-4 px-[22px]">
          <div className="flex items-center gap-2">
            <div className="flex h-[38px] w-[340px] items-center gap-2 rounded-[10px] bg-bg px-3 text-ink-faint">
              <ListFilter className="size-[13px] shrink-0" aria-hidden />
              <input
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (!event.target.value) void navigate({ search: {} })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applyFilter()
                }}
                placeholder="FILTER SESSION ID"
                aria-label="Filter Session ID"
                className="w-full bg-transparent font-data text-[9.5px] tracking-[0.8px] text-ink uppercase outline-none placeholder:text-ink-faint"
              />
              <span className="font-data text-[9.5px] text-ink-faint">↵</span>
            </div>
            <p className="font-data text-[9px] tracking-[0.8px] text-ink-faint">
              {sessionId ? `filter: ${sessionId}` : 'semua sesi'}
            </p>
          </div>
          <p className="font-data text-[9.5px] text-ink-faint">
            {loading ? 'memuat...' : `${rows.length} entri`}
          </p>
        </div>

        <div className="h-4" />

        <div className={cn(GRID, 'h-8 px-[22px]')}>
          <p className={COL_HEAD}>WAKTU</p>
          <p className={COL_HEAD}>SESI</p>
          <p className={COL_HEAD}>TUJUAN</p>
          <p className={COL_HEAD}>CUSTOMER</p>
          <p className={COL_HEAD}>ISI PESAN</p>
          <p className={COL_HEAD}>STATUS</p>
          <span />
        </div>
        <div className="h-px w-full bg-line" />

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <p className="px-[22px] py-6 text-small text-red">{error}</p>
          ) : null}

          {!error && loading && !loaded ? (
            <p className="px-[22px] py-16 text-center text-small text-ink-faint">
              Memuat riwayat...
            </p>
          ) : null}

          {!error && !loading && loaded && rows.length === 0 ? (
            <p className="px-[22px] py-16 text-center text-small text-ink-faint">
              Belum ada pesan keluar yang tercatat.
            </p>
          ) : null}

          {!error &&
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(GRID, 'h-[58px] border-b border-line px-[22px] last:border-0')}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="font-data text-[11px] text-ink">{clock(row.createdAt)}</p>
                  <p className="font-data text-[8.5px] text-ink-faint">{day(row.createdAt)}</p>
                </div>
                <p className="truncate font-data text-[9.5px] text-ink-soft">{row.sessionId}</p>
                <p className="truncate font-data text-[9.5px] text-ink-soft">
                  {formatPhone(row.to)}
                </p>
                <p className="truncate text-[12px] text-ink">{row.customerName ?? '—'}</p>
                <p className="min-w-0 truncate text-[11.5px] text-ink-soft">
                  {truncate(row.body ?? '—', 90)}
                </p>
                <div>
                  <Badge tone={tone(row.status)}>{MESSAGE_STATUS_LABELS[row.status]}</Badge>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    aria-label="Hapus entri riwayat"
                    onClick={() => setDeleteId(row.id)}
                    className="text-ink-faint transition hover:text-ink"
                  >
                    <Trash2 className="size-[13px]" aria-hidden />
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div className="flex items-center justify-between px-[22px] py-3.5">
          <p className="text-[11px] text-ink-soft">Menampilkan {rows.length} pesan terbaru</p>
          <p className="font-data text-[9px] text-ink-faint">
            hapus entri lewat ikon tempat sampah
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Hapus riwayat"
        message="Entri ini dihapus dari daftar (soft delete) dan tidak muncul lagi. Lanjutkan?"
        confirmLabel={deleting ? 'Menghapus...' : 'Hapus'}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void remove()}
      />
    </div>
  )
}
