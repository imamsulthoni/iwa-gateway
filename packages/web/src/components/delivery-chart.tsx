import type { StatsBucketDto, StatsBucketKind } from '@wbc/shared'

import { formatNumber } from '../lib/format'

const DAY_LABELS = ['S', 'S', 'R', 'K', 'J', 'S', 'M']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const DAY_NAMES = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const MONTH_NAMES = MONTH_LABELS
const MAX_BAR_PX = 46
const MIN_BAR_PX = 12

export function barHeights(values: number[], maxPx = MAX_BAR_PX, minPx = MIN_BAR_PX): number[] {
  const max = Math.max(...values, 0)
  return values.map((value) => (max <= 0 ? minPx : Math.max(minPx, Math.round((value / max) * maxPx))))
}

export function bucketLabel(
  bucket: StatsBucketDto,
  kind: StatsBucketKind,
  index: number,
): string {
  if (kind === 'day') {
    // Jam 12 UTC agar perbandingan tanggal bebas timezone browser.
    const weekday = (new Date(`${bucket.startDate}T12:00:00Z`).getUTCDay() + 6) % 7
    return DAY_LABELS[weekday] ?? ''
  }
  if (kind === 'week') return String(index + 1)
  return MONTH_NAMES[Number(bucket.startDate.slice(5, 7)) - 1] ?? ''
}

export function bucketState(
  bucket: StatsBucketDto,
  todayDate: string,
): 'past' | 'current' | 'future' {
  if (bucket.startDate > todayDate) return 'future'
  if (bucket.endDate < todayDate) return 'past'
  return 'current'
}

export function bucketTooltip(bucket: StatsBucketDto, kind: StatsBucketKind): string {
  const suffix = `${formatNumber(bucket.sent)} pesan${bucket.failed > 0 ? ` · ${formatNumber(bucket.failed)} gagal` : ''}`
  if (kind === 'day') {
    const weekday = (new Date(`${bucket.startDate}T12:00:00Z`).getUTCDay() + 6) % 7
    return `${DAY_NAMES[weekday]} ${dayLabel(bucket.startDate)} · ${suffix}`
  }
  if (kind === 'month') return `${MONTH_NAMES[Number(bucket.startDate.slice(5, 7)) - 1]} · ${suffix}`
  const start = dayLabel(bucket.startDate)
  const end = bucket.endDate === bucket.startDate ? null : dayLabel(bucket.endDate)
  return end ? `${start}–${end} · ${suffix}` : `${start} · ${suffix}`
}

function dayLabel(date: string): string {
  const day = String(Number(date.slice(8, 10)))
  return `${day} ${MONTH_LABELS[Number(date.slice(5, 7)) - 1] ?? ''}`
}

type DeliveryChartProps = {
  bucketKind: StatsBucketKind
  buckets: StatsBucketDto[]
  todayDate: string
}

export function DeliveryChart({ bucketKind, buckets, todayDate }: DeliveryChartProps) {
  const heights = barHeights(buckets.map((bucket) => bucket.sent))
  const states = buckets.map((bucket) => bucketState(bucket, todayDate))
  const peak = Math.max(...buckets.map((bucket) => bucket.sent), 0)
  const total = buckets.reduce((sum, bucket) => sum + bucket.sent, 0)

  return (
    <div
      role="img"
      aria-label={`Grafik pengiriman, ${buckets.length} titik, total ${formatNumber(total)} pesan`}
      className="flex h-[72px] shrink-0 items-end gap-[7px]"
    >
      {buckets.map((bucket, index) => {
        const state = states[index] ?? 'past'
        const active = state === 'current' || (peak > 0 && bucket.sent === peak && state === 'past')
        return (
          <div
            key={bucket.startDate}
            className="flex w-[18px] flex-col items-center justify-end gap-[5px]"
            title={bucketTooltip(bucket, bucketKind)}
          >
            <span
              className={`w-[18px] rounded-chip ${
                state === 'future'
                  ? 'border border-dashed border-line'
                  : active
                    ? 'bg-ink'
                    : 'bg-line'
              }`}
              style={state === 'future' ? { height: MIN_BAR_PX } : { height: heights[index] }}
            />
            <span
              className={`font-data text-micro whitespace-nowrap ${
                active ? 'text-ink' : 'text-ink-faint'
              }`}
            >
              {bucketLabel(bucket, bucketKind, index)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
