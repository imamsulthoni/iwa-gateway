import { MESSAGE_STATUS_LABELS } from '@wa/shared'
import { ArrowRight, ChevronDown, RefreshCw, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { Badge, Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import { formatDateTime, formatPhone, truncate } from '../../lib/format'
import type { MessageListDto, RetryMessageResponseDto, SessionDto } from '../../lib/types'
import { CardLabel, NoteRow, Panel } from './parts'

type RiwayatTabProps = {
  session: SessionDto
}

const GRID = 'grid grid-cols-[70px_112px_92px_minmax(0,1fr)_96px_30px] items-center'

export function RiwayatTab({ session }: RiwayatTabProps) {
  const [items, setItems] = useState<MessageListDto['items']>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  async function load(nextCursor?: string) {
    setLoading(true)
    setError(null)
    try {
      const query = new URLSearchParams({ limit: '20', direction: 'out' })
      if (nextCursor) query.set('cursor', nextCursor)
      const page = await api.get<MessageListDto>(
        `/sessions/${session.id}/messages?${query.toString()}`,
      )
      setItems((previous) => (nextCursor ? [...previous, ...page.items] : page.items))
      setCursor(page.nextCursor)
      setLoaded(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memuat riwayat')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [session.id])

  async function retry(id: string) {
    setRetryingId(id)
    setError(null)
    try {
      const result = await api.post<RetryMessageResponseDto>(`/messages/${id}/retry`)
      setItems((previous) => previous.map((item) => (item.id === id ? result.message : item)))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengirim ulang pesan')
    } finally {
      setRetryingId(null)
    }
  }

  const sent = items.filter((item) => ['sent', 'delivered', 'read'].includes(item.status)).length
  const failed = items.filter((item) => item.status === 'failed').length
  const today = items.filter((item) => isToday(item.createdAt)).length
  const last = items[0]

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex w-[720px] max-w-full flex-col gap-4">
        <section className="flex flex-col rounded-card border border-line bg-surface pt-5">
          <div className="flex items-start justify-between gap-4 px-[22px]">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
                Riwayat pengiriman
              </h2>
              <p className="text-small text-ink-faint">
                Pesan keluar dari sesi ini, urut dari yang terbaru.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-[30px] px-3 text-[11.5px]"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw className="size-3 text-ink-soft" aria-hidden />
              Segarkan
            </Button>
          </div>

          <div className="h-4" />

          <div className={cn(GRID, 'h-8 px-[22px]')}>
            <p className={COL_HEAD}>Waktu</p>
            <p className={COL_HEAD}>Tujuan</p>
            <p className={COL_HEAD}>Client Ref</p>
            <p className={COL_HEAD}>Isi pesan</p>
            <p className={COL_HEAD}>Status</p>
            <span />
          </div>
          <div className="h-px w-full bg-line" />

          {error ? <p className="px-[22px] py-6 text-small text-red">{error}</p> : null}

          {!error && loaded && items.length === 0 ? (
            <p className="px-[22px] py-10 text-center text-small text-ink-faint">
              Belum ada pesan keluar. Kirim pesan dari tab Kirim.
            </p>
          ) : null}

          {!error && !loaded ? (
            <p className="px-[22px] py-10 text-center text-small text-ink-faint">Memuat riwayat...</p>
          ) : null}

          {items.map((message, index) => (
            <div key={message.id}>
              {index > 0 ? <div className="h-px w-full bg-line" /> : null}
              <div className={cn(GRID, 'h-[54px] px-[22px]')}>
                <p className="font-data text-[10px] text-ink-soft">{clock(message.createdAt)}</p>
                <p className="font-data text-[9px] text-ink-soft">{formatPhone(message.to)}</p>
                <p className="truncate font-data text-[9.5px] text-ink-soft">
                  {message.clientRef ?? '—'}
                </p>
                <p className="truncate text-[10.5px] text-ink-soft">
                  {truncate(message.body ?? '—', 80)}
                </p>
                <div>
                  <Badge tone={tone(message.status)}>
                    {MESSAGE_STATUS_LABELS[message.status]}
                  </Badge>
                </div>
                <div className="flex justify-end">
                  {message.status === 'failed' ? (
                    <button
                      type="button"
                      aria-label="Kirim ulang pesan"
                      title="Kirim ulang"
                      disabled={retryingId === message.id}
                      onClick={() => void retry(message.id)}
                      className="text-ink-faint transition hover:text-ink disabled:opacity-50"
                    >
                      <RotateCcw
                        className={cn('size-[13px]', retryingId === message.id && 'animate-spin')}
                        aria-hidden
                      />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 border-t border-line px-[22px] py-3.5">
            <p className="font-data text-[9.5px] text-ink-soft">
              {items.length === 0 ? '0 pesan' : `1–${items.length} pesan`}
            </p>
            <div className="flex items-center gap-2.5">
              <p className="font-data text-[9px] text-ink-faint">20 per halaman</p>
              {cursor ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-[30px] px-3 text-[11.5px]"
                  disabled={loading}
                  onClick={() => void load(cursor)}
                >
                  <ChevronDown className="size-3 text-ink-soft" aria-hidden />
                  Muat lebih
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <div className="flex min-w-[320px] flex-1 flex-col gap-4">
        <Panel className="gap-0 p-[18px]">
          <CardLabel>Ringkasan kirim</CardLabel>
          <div className="h-3" />
          <div className="flex">
            <div className="flex flex-1 flex-col gap-[3px]">
              <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">
                Terkirim
              </p>
              <p className="text-lg font-semibold text-ink">{sent}</p>
            </div>
            <span className="h-[30px] w-px self-center bg-line" />
            <div className="flex flex-1 flex-col gap-[3px] px-3">
              <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">Gagal</p>
              <p className="text-lg font-semibold text-red">{failed}</p>
            </div>
            <span className="h-[30px] w-px self-center bg-line" />
            <div className="flex flex-1 flex-col gap-[3px] px-3">
              <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">
                Hari ini
              </p>
              <p className="text-lg font-semibold text-ink">{today}</p>
            </div>
          </div>
          <div className="h-3" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-note text-ink-faint">terakhir terkirim</p>
            <p className="font-data text-[9.5px] text-ink-soft">
              {last ? clock(last.createdAt) : '—'}
            </p>
          </div>
        </Panel>

        <Panel className="gap-0 p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <CardLabel>Pesan terakhir</CardLabel>
            {last ? (
              <Badge tone={tone(last.status)}>{MESSAGE_STATUS_LABELS[last.status]}</Badge>
            ) : null}
          </div>
          <div className="h-3" />
          {last ? (
            <>
              <p className="text-small leading-[1.5] text-ink">
                {truncate(last.body ?? '—', 120)}
              </p>
              <div className="h-3" />
              <SummaryRow label="Message ID" value={last.id} />
              <SummaryRow label="Ke" value={formatPhone(last.to)} />
              <SummaryRow label="Client Ref" value={last.clientRef ?? '—'} />
              <SummaryRow label="Waktu" value={formatDateTime(last.createdAt)} />
            </>
          ) : (
            <p className="text-small text-ink-faint">Belum ada pesan.</p>
          )}
        </Panel>

        <Panel className="gap-2.5 p-[18px]">
          <CardLabel>Cakupan data</CardLabel>
          <NoteRow>Hanya pesan keluar yang dicatat.</NoteRow>
          <NoteRow>Pesan masuk tidak pernah disimpan.</NoteRow>
          <NoteRow>Hapus entri bersifat permanen.</NoteRow>
          <Link
            to="/history"
            className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-ink hover:underline"
          >
            Riwayat semua sesi
            <ArrowRight className="size-[11px]" aria-hidden />
          </Link>
        </Panel>
      </div>
    </div>
  )
}

const COL_HEAD = 'font-data text-[8.5px] tracking-[1.1px] text-ink-soft uppercase'

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[5px]">
      <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</p>
      <p className="max-w-[60%] truncate font-data text-[9.5px] text-ink-soft">{value}</p>
    </div>
  )
}

function clock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function isToday(value: string): boolean {
  const date = new Date(value)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

function tone(status: string) {
  if (status === 'failed') return 'danger' as const
  if (status === 'queued') return 'neutral' as const
  return 'success' as const
}