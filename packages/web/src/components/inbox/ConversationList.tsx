import { cn, FilterChip, SearchInput } from '../../design-system'
import { clock, initials, roomPreview, type InboxRoom } from './model'

type ConversationListProps = {
  rooms: InboxRoom[]
  total: number
  selectedId: string | null
  onSelect: (id: string) => void
  query: string
  onQuery: (value: string) => void
  filter: string
  onFilter: (value: string) => void
  filters: { value: string; label: string }[]
  unreadTotal: number
  loading: boolean
  emptyText: string
}

export function ConversationList({
  rooms,
  total,
  selectedId,
  onSelect,
  query,
  onQuery,
  filter,
  onFilter,
  filters,
  unreadTotal,
  loading,
  emptyText,
}: ConversationListProps) {
  return (
    <section className="flex w-[352px] shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-col gap-[11px] px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold tracking-[-0.3px] text-ink">Percakapan</p>
          <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint">{unreadTotal} BARU</p>
        </div>
        <SearchInput
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Cari nomor atau sesi"
          aria-label="Cari percakapan"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3.5">
        {filters.map((item) => (
          <FilterChip
            key={item.value}
            active={filter === item.value}
            onClick={() => onFilter(item.value)}
          >
            {item.label}
          </FilterChip>
        ))}
      </div>

      <div className="h-px w-full bg-line" />

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="px-4 py-10 text-center text-small text-ink-faint">Memuat percakapan...</p>
        ) : null}
        {!loading && rooms.length === 0 ? (
          <p className="px-4 py-10 text-center text-small text-ink-faint">{emptyText}</p>
        ) : null}
        {rooms.map((room) => {
          const selected = room.id === selectedId
          const unread = room.unreadCount > 0
          return (
            <button
              key={room.id}
              type="button"
              onClick={() => onSelect(room.id)}
              className={cn(
                'flex w-full items-center gap-2.5 border-b border-line px-4 py-3 text-left transition last:border-0',
                selected ? 'bg-surface-soft' : 'hover:bg-surface-soft',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-pill font-data text-[9.5px] font-semibold',
                  unread ? 'bg-ink text-white' : 'border border-line bg-surface-soft text-ink-soft',
                )}
              >
                {initials(room.address)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'truncate text-body text-ink',
                      unread ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {room.address}
                  </span>
                  <span className="shrink-0 font-data text-[8.5px] text-ink-faint">
                    {room.lastMessageAt ? clock(room.lastMessageAt) : '—'}
                  </span>
                </span>
                <span className="truncate text-[11px] text-ink-soft">{roomPreview(room)}</span>
                <span className="truncate font-data text-[8px] tracking-[0.4px] text-ink-faint">
                  {room.sessionLabel}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="h-px w-full bg-line" />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="font-data text-[9px] text-ink-faint">
          {rooms.length} dari {total} percakapan
        </p>
        <p className="font-data text-[9px] text-ink-faint">urut: terbaru</p>
      </div>
    </section>
  )
}
