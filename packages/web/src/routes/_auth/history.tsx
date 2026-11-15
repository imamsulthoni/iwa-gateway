import { MESSAGE_STATUS_LABELS } from '@wa/shared'
import { createFileRoute } from '@tanstack/react-router'
import { ListFilter, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ConfirmDialog } from '../../components/dialogs'
import { Badge, Button, cn } from '../../design-system'
import type { BadgeTone } from '../../design-system'
import { demoListHistory } from '../../lib/demo'
import { formatPhone, truncate } from '../../lib/format'

export const Route = createFileRoute('/_auth/history')({
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
  const [rows, setRows] = useState(() => demoListHistory())
  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('')
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (row) =>
        row.sessionPublicId.toLowerCase().includes(needle) ||
        row.sessionId.toLowerCase().includes(needle),
    )
  }, [rows, filter])

  const days = new Set(visible.map((row) => key(row.createdAt))).size

  function refresh() {
    setRows(demoListHistory())
    setUpdatedAt(new Date())
  }

  function applyFilter() {
    setFilter(draft.trim())
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
            {visible.length} pesan · {days} hari
          </p>
          <Button
            variant="secondary"
            className="h-[34px] gap-[7px] px-3.5 text-[12.5px]"
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
                  if (!event.target.value) setFilter('')
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
              {filter ? `filter: ${filter}` : 'semua sesi'}
            </p>
          </div>
          <p className="font-data text-[9.5px] text-ink-faint">
            diperbarui {clock(updatedAt.toISOString())}
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
          {visible.length === 0 ? (
            <p className="px-[22px] py-16 text-center text-small text-ink-faint">
              Tidak ada pesan yang cocok dengan filter.
            </p>
          ) : null}

          {visible.map((row) => (
            <div
              key={row.id}
              className={cn(GRID, 'h-[58px] border-b border-line px-[22px] last:border-0')}
            >
              <div className="flex flex-col gap-0.5">
                <p className="font-data text-[11px] text-ink">{clock(row.createdAt)}</p>
                <p className="font-data text-[8.5px] text-ink-faint">{day(row.createdAt)}</p>
              </div>
              <p className="truncate font-data text-[9.5px] text-ink-soft">{row.sessionPublicId}</p>
              <p className="truncate font-data text-[9.5px] text-ink-soft">{formatPhone(row.to)}</p>
              <p className="truncate text-[12px] text-ink">{row.customerName}</p>
              <p className="min-w-0 truncate text-[11.5px] text-ink-soft">
                {truncate(row.body ?? '—', 90)}
              </p>
              <div>
                <Badge tone={tone(row.status)}>{MESSAGE_STATUS_LABELS[row.status]}</Badge>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  aria-label={`Hapus pesan ke ${row.customerName}`}
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
          <p className="text-[11px] text-ink-soft">Menampilkan {visible.length} pesan terbaru</p>
          <p className="font-data text-[9px] text-ink-faint">
            hapus entri lewat ikon tempat sampah
          </p>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Hapus riwayat"
        message="Entri riwayat ini akan dihapus dari daftar pratinjau. Lanjutkan?"
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          setRows((previous) => previous.filter((row) => row.id !== deleteId))
          setDeleteId(null)
        }}
      />
    </div>
  )
}
