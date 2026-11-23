import { SESSION_STATUS_LABELS } from '@wbc/shared'
import { Send } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge, Button, cn, Input, type BadgeTone } from '../../design-system'
import type { RoomMessageDto } from '../../lib/types'
import { dayLabel, initials, messageLabel, messageMeta, type InboxRoom } from './model'

const QUICK_REPLIES = ['Konfirmasi transfer', 'Info ongkir', 'Cek pesanan']

function statusTone(status: string): BadgeTone {
  if (status === 'connected') return 'success'
  if (status === 'qr_pending' || status === 'connecting') return 'warning'
  if (status === 'logged_out') return 'danger'
  return 'neutral'
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex w-full items-center gap-2.5">
      <span className="h-px flex-1 bg-line" />
      <span className="font-data text-[8.5px] tracking-[1px] text-ink-faint">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function Bubble({ row }: { row: RoomMessageDto }) {
  const out = row.direction === 'out'
  return (
    <div className={cn('flex w-full flex-col', out ? 'items-end' : 'items-start')}>
      <div className={cn('flex max-w-[78%] flex-col gap-[5px]', out ? 'items-end' : 'items-start')}>
        <p className="font-data text-[8.5px] tracking-[0.6px] text-ink-faint">{messageMeta(row)}</p>
        <div
          className={cn(
            'px-3 py-[9px] text-[12px] leading-[1.45] whitespace-pre-wrap',
            out
              ? 'rounded-[12px_12px_3px_12px] bg-ink text-white'
              : 'rounded-[3px_12px_12px_12px] bg-surface-soft text-ink',
          )}
        >
          {messageLabel(row) || '—'}
        </div>
      </div>
    </div>
  )
}

type MessageThreadProps = {
  room: InboxRoom | null
  messages: RoomMessageDto[]
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  draft: string
  onDraft: (value: string) => void
  onSend: () => void
  sending: boolean
  emptyText: string
}

export function MessageThread({
  room,
  messages,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  draft,
  onDraft,
  onSend,
  sending,
  emptyText,
}: MessageThreadProps) {
  if (!room) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center rounded-card border border-line bg-surface">
        <p className="max-w-[320px] px-6 text-center text-small text-ink-faint">{emptyText}</p>
      </section>
    )
  }

  const ordered = [...messages].reverse()
  const stream: ReactNode[] = []
  let currentDay = ''
  for (const row of ordered) {
    const label = dayLabel(row.createdAt)
    if (label !== currentDay) {
      stream.push(<DayDivider key={`day-${row.id}`} label={label} />)
      currentDay = label
    }
    stream.push(<Bubble key={row.id} row={row} />)
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <header className="flex items-center gap-3 px-5 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-pill border border-line bg-surface-soft font-data text-[10px] font-semibold text-ink-soft">
          {initials(room.address)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[14px] font-semibold tracking-[-0.2px] text-ink">
            {room.address}
          </p>
          <p className="truncate font-data text-[9.5px] text-ink-faint">
            {room.waJid} · {room.sessionLabel}
          </p>
        </div>
        <Badge tone={statusTone(room.sessionStatus)}>
          {(SESSION_STATUS_LABELS as Record<string, string>)[room.sessionStatus] ??
            room.sessionStatus}
        </Badge>
      </header>

      <div className="h-px w-full bg-line" />

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-5 py-[18px]">
        {hasMore ? (
          <Button
            variant="secondary"
            size="sm"
            className="mx-auto"
            disabled={loadingMore}
            onClick={onLoadMore}
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
        {stream}
      </div>

      <div className="h-px w-full bg-line" />

      <div className="flex items-center gap-1.5 overflow-x-auto px-5 pt-3">
        <span className="shrink-0 font-data text-[8px] tracking-[1px] text-ink-faint">
          BALASAN CEPAT
        </span>
        {QUICK_REPLIES.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onDraft(text)}
            className="shrink-0 rounded-pill bg-bg px-[9px] py-1 text-[11px] text-ink-soft transition outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/15"
          >
            {text}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-5 pt-3 pb-4">
        <Input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSend()
            }
          }}
          placeholder={`Tulis balasan untuk ${room.address}...`}
          aria-label="Tulis balasan"
          className="flex-1"
        />
        <Button
          size="icon"
          aria-label="Kirim balasan"
          disabled={sending || !draft.trim()}
          onClick={onSend}
        >
          <Send className="size-[15px]" aria-hidden />
        </Button>
      </div>
    </section>
  )
}
