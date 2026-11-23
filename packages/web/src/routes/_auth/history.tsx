import { MESSAGE_STATUS_LABELS } from '@wbc/shared'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { ConfirmDialog } from '../../components/dialogs'
import { Badge, Button, Select, cn } from '../../design-system'
import type { BadgeTone } from '../../design-system'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { formatPhone, usePolling } from '../../lib/format'
import type { MessageListDto, RetryMessageResponseDto, SessionListDto } from '../../lib/types'

export const Route = createFileRoute('/_auth/history')({
  beforeLoad: () => {
    if (!isAdmin()) throw redirect({ to: '/numbers' })
  },
  validateSearch: (search: Record<string, unknown>): HistorySearch => {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined
    const from = text(search.from)
    const to = text(search.to)
    return {
      from: from && datePattern.test(from) ? from : undefined,
      to: to && datePattern.test(to) ? to : undefined,
      sales: text(search.sales),
      customer: text(search.customer),
    }
  },
  component: HistoryPage,
})

const GRID = 'grid grid-cols-[96px_150px_128px_120px_minmax(0,1fr)_104px_64px] items-center'
const COL_HEAD = 'font-data text-[9px] tracking-[1.1px] text-ink-soft uppercase'

type HistorySearch = {
  from?: string
  to?: string
  sales?: string
  customer?: string
}

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

function dayStart(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(year, month - 1, day).toISOString()
}

function dayEnd(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}

function HistoryPage() {
  const { from, to, sales, customer } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [rows, setRows] = useState<MessageListDto['items']>([])
  const [customerDraft, setCustomerDraft] = useState(customer ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const sessions = usePolling<SessionListDto>(
    () => api.get<SessionListDto>('/v1/sessions'),
    30_000,
    true,
  )

  const load = useCallback(async (filters: HistorySearch) => {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ limit: '50', direction: 'out' })
      if (filters.from) query.set('from', dayStart(filters.from))
      if (filters.to) query.set('to', dayEnd(filters.to))
      if (filters.sales) query.set('sales', filters.sales)
      if (filters.customer) query.set('customer', filters.customer)
      const page = await api.get<MessageListDto>(`/v1/messages?${query.toString()}`)
      setRows(page.items)
      setLoaded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setCustomerDraft(customer ?? '')
  }, [customer])

  useEffect(() => {
    void load({ from, to, sales, customer })
  }, [load, from, to, sales, customer])

  const days = useMemo(() => new Set(rows.map((row) => key(row.createdAt))).size, [rows])

  const salesOptions = useMemo(() => {
    const names = new Set<string>()
    for (const item of sessions.data?.items ?? []) {
      if (item.salesName) names.add(item.salesName)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [sessions.data])

  const hasFilters = Boolean(from || to || sales || customer)

  function refresh() {
    void load({ from, to, sales, customer })
  }

  function setFilter(patch: Partial<HistorySearch>) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }) })
  }

  async function remove() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/v1/messages/${deleteId}`)
      setRows((previous) => previous.filter((row) => row.id !== deleteId))
      setDeleteId(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menghapus riwayat')
    } finally {
      setDeleting(false)
    }
  }

  async function retry(id: string) {
    setRetryingId(id)
    setError(null)
    try {
      const result = await api.post<RetryMessageResponseDto>(`/v1/messages/${id}/retry`)
      setRows((previous) => previous.map((row) => (row.id === id ? result.message : row)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengirim ulang pesan')
    } finally {
      setRetryingId(null)
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
            Refresh
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-[38px] items-center gap-2 rounded-[10px] bg-bg px-3 text-ink-faint">
              <span className="font-data text-[9px] tracking-[0.8px] text-ink-faint uppercase">
                Dari
              </span>
              <input
                type="date"
                value={from ?? ''}
                onChange={(event) => setFilter({ from: event.target.value || undefined })}
                aria-label="Filter tanggal mulai"
                className="w-[130px] bg-transparent font-data text-[9.5px] tracking-[0.8px] text-ink uppercase outline-none"
              />
            </div>
            <div className="flex h-[38px] items-center gap-2 rounded-[10px] bg-bg px-3 text-ink-faint">
              <span className="font-data text-[9px] tracking-[0.8px] text-ink-faint uppercase">
                Sampai
              </span>
              <input
                type="date"
                value={to ?? ''}
                onChange={(event) => setFilter({ to: event.target.value || undefined })}
                aria-label="Filter tanggal akhir"
                className="w-[130px] bg-transparent font-data text-[9.5px] tracking-[0.8px] text-ink uppercase outline-none"
              />
            </div>
            <Select
              label="Sales"
              className="w-[170px]"
              size="sm"
              value={sales ?? ''}
              onChange={(next) => setFilter({ sales: next || undefined })}
              options={[
                { value: '', label: 'Semua sales' },
                ...salesOptions.map((name) => ({ value: name, label: name })),
              ]}
            />
            <div className="flex h-[38px] w-[190px] items-center gap-2 rounded-[10px] bg-bg px-3 text-ink-faint">
              <input
                value={customerDraft}
                onChange={(event) => {
                  setCustomerDraft(event.target.value)
                  if (!event.target.value) setFilter({ customer: undefined })
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setFilter({ customer: customerDraft.trim() || undefined })
                  }
                }}
                placeholder="NAMA CUSTOMER"
                aria-label="Filter nama customer"
                className="w-full bg-transparent font-data text-[9.5px] tracking-[0.8px] text-ink uppercase outline-none placeholder:text-ink-faint"
              />
              <span className="font-data text-[9.5px] text-ink-faint">↵</span>
            </div>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCustomerDraft('')
                  void navigate({ search: {} })
                }}
              >
                Reset
              </Button>
            ) : null}
          </div>
          <p className="font-data text-[9.5px] text-ink-faint">
            {loading ? 'memuat...' : `${rows.length} entri`}
          </p>
        </div>

        <div className="h-4" />

        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className={cn(GRID, 'sticky top-0 z-10 h-8 border-b border-line bg-surface px-[22px]')}
          >
            <p className={COL_HEAD}>WAKTU</p>
            <p className={COL_HEAD}>SALES</p>
            <p className={COL_HEAD}>TUJUAN</p>
            <p className={COL_HEAD}>CUSTOMER</p>
            <p className={COL_HEAD}>ISI PESAN</p>
            <p className={COL_HEAD}>STATUS</p>
            <span />
          </div>

          {error ? <p className="px-[22px] py-6 text-small text-red">{error}</p> : null}

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
                className={cn(GRID, 'min-h-[58px] py-2.5 border-b border-line px-[22px] last:border-0')}
              >
                <div className="flex flex-col gap-0.5">
                  <p className="font-data text-[11px] text-ink">{clock(row.createdAt)}</p>
                  <p className="font-data text-[8.5px] text-ink-faint">{day(row.createdAt)}</p>
                </div>
                <p className="truncate font-data text-[9.5px] text-ink-soft">
                  {row.salesName ?? row.sessionId}
                </p>
                <p className="truncate font-data text-[9.5px] text-ink-soft">
                  {formatPhone(row.to)}
                </p>
                <p className="truncate text-[12px] text-ink">{row.customerName ?? '—'}</p>
                <p className="min-w-0 wrap-break-word pr-6 text-[11.5px] text-ink-soft">
                  {row.body ?? '—'}
                </p>
                <div>
                  <Badge tone={tone(row.status)}>{MESSAGE_STATUS_LABELS[row.status]}</Badge>
                </div>
                <div className="flex items-center justify-end gap-2.5">
                  {row.status === 'failed' ? (
                    <button
                      type="button"
                      aria-label="Kirim ulang pesan"
                      title="Kirim ulang"
                      disabled={retryingId === row.id}
                      onClick={() => void retry(row.id)}
                      className="text-ink-faint transition hover:text-ink disabled:opacity-50"
                    >
                      <RotateCcw
                        className={cn('size-[13px]', retryingId === row.id && 'animate-spin')}
                        aria-hidden
                      />
                    </button>
                  ) : null}
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
