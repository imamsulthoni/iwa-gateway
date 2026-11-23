import { DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS } from '@wbc/shared'
import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Megaphone, RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  Badge,
  Button,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../design-system'
import { SessionStatusBadge } from '../../components/session-status'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { formatDateTime, formatNumber, usePolling } from '../../lib/format'
import type {
  BroadcastCurrentDto,
  HealthDto,
  SessionListDto,
  StatsDto,
  StatsPeriod,
} from '../../lib/types'

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  day: 'Hari ini',
  week: 'Minggu ini',
  month: 'Bulan ini',
  year: 'Tahun ini',
}

export const Route = createFileRoute('/_auth/overview')({
  beforeLoad: () => {
    if (!isAdmin()) throw redirect({ to: '/numbers' })
  },
  component: OverviewPage,
})

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="font-data text-label tracking-[0.11em] text-ink-faint uppercase">{label}</p>
      <p className="mt-1 text-[21px] font-semibold tracking-[-0.6px] text-ink">{value}</p>
    </div>
  )
}

function useBroadcasts(sessionIds: string[], enabled: boolean) {
  return usePolling<BroadcastCurrentDto[]>(
    () =>
      Promise.all(
        sessionIds.map((id) =>
          api
            .get<BroadcastCurrentDto>(`/v1/sessions/${id}/broadcast/current`)
            .catch(() => null),
        ),
      ).then((rows) => rows.filter((row): row is BroadcastCurrentDto => row !== null)),
    15_000,
    enabled && sessionIds.length > 0,
  )
}

function OverviewPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<StatsPeriod>('day')
  const stats = usePolling<StatsDto>(
    () => api.get<StatsDto>(`/v1/stats?period=${period}`),
    15_000,
    true,
    period,
  )
  const sessions = usePolling<SessionListDto>(
    () => api.get<SessionListDto>('/v1/sessions'),
    15_000,
    true,
  )
  const health = usePolling<HealthDto>(() => api.get<HealthDto>('/v1/health'), 20_000, true)

  const items = sessions.data?.items ?? []
  const total = items.length
  const connected = items.filter((item) => item.status === 'connected').length
  const periodCount = stats.data?.periodMessages ?? 0
  const totalMessages = stats.data?.totalMessages ?? 0
  const running = stats.data?.runningBroadcasts ?? 0
  const healthy = health.data?.status === 'ok'
  const segments = Math.max(total, 5)

  const connectedIds = useMemo(
    () =>
      items
        .filter((item) => item.status === 'connected')
        .slice(0, 5)
        .map((item) => item.id),
    [items],
  )
  const broadcasts = useBroadcasts(connectedIds, running > 0)
  // Saat tidak ada broadcast aktif, data poll terakhir tidak dipakai lagi agar
  // kartu broadcast yang sudah selesai tidak tertinggal di layar.
  const activeBroadcasts =
    running > 0 ? (broadcasts.data?.filter((job) => job.jobId !== null) ?? []) : []
  const sessionById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const error = stats.error ?? sessions.error ?? health.error

  function refresh() {
    stats.refresh()
    sessions.refresh()
    health.refresh()
    broadcasts.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow="OVERVIEW / LIVE"
        title="Ringkasan"
        description="Status layanan dan pengiriman WhatsApp, sekilas."
        actions={
          <>
            <span className="font-data text-[9.5px] text-ink-faint">auto-refresh 15s</span>
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
              Refresh
            </Button>
            <Button onClick={() => void navigate({ to: '/numbers' })}>
              Kelola nomor
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Button>
          </>
        }
      />

      {error ? (
        <div className="rounded-lg bg-red-soft px-3 py-2 text-note text-red">{error}</div>
      ) : null}

      <div className="rounded-card border border-line bg-surface p-card">
        <div className="flex items-center justify-between">
          <p className="font-data text-label tracking-[1.4px] text-ink-faint uppercase">
            Pengiriman
          </p>
          <Select
            label="Periode pengiriman"
            size="sm"
            className="w-[148px]"
            value={period}
            options={(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((value) => ({
              value,
              label: PERIOD_LABELS[value],
            }))}
            onChange={(value) => setPeriod(value as StatsPeriod)}
          />
        </div>

        <div className="mt-3.5 flex items-end gap-3.5">
          <p className="text-[56px] leading-[0.95] font-semibold tracking-[-2.4px] text-ink">
            {formatNumber(periodCount)}
          </p>
          <p className="pb-1.5 text-body text-ink-soft">
            pesan terkirim {PERIOD_LABELS[period].toLowerCase()}
          </p>
        </div>

        <div className="mt-5 flex items-center">
          <Metric label="Sesi terhubung" value={`${connected} / ${total}`} className="flex-1" />
          <span className="h-[34px] w-px shrink-0 bg-line" />
          <Metric
            label="Total pesan"
            value={formatNumber(totalMessages)}
            className="flex-1 px-[18px]"
          />
          <span className="h-[34px] w-px shrink-0 bg-line" />
          <Metric
            label="Broadcast berjalan"
            value={formatNumber(running)}
            className="flex-1 px-[18px]"
          />
          <span className="h-[34px] w-px shrink-0 bg-line" />
          <Metric label="Total sesi" value={formatNumber(total)} className="flex-1 pl-[18px]" />
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex min-h-[252px] flex-1 flex-col rounded-card border border-line bg-surface p-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex size-[26px] items-center justify-center rounded-[7px] bg-surface-soft">
                <Megaphone className="size-3.5 text-ink" aria-hidden />
              </span>
              <p className="text-[14.5px] font-semibold tracking-[-0.2px] text-ink">
                Broadcast berjalan
              </p>
            </div>
            <span className="rounded-pill bg-surface-soft px-2 py-[3px] font-data text-[9.5px] text-ink-soft">
              {running} aktif
            </span>
          </div>

          <div className="mt-4 flex flex-1 flex-col gap-3">
            {activeBroadcasts.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line px-4 py-8 text-center text-small text-ink-faint">
                Belum ada broadcast berjalan.
              </div>
            ) : (
              activeBroadcasts.map((job) => {
                const session = job.jobId
                  ? [...sessionById.entries()].find(([id]) =>
                      connectedIds.includes(id),
                    )
                  : undefined
                return (
                  <div
                    key={job.jobId}
                    className="flex flex-col gap-2 rounded-lg border border-line px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-data text-[10px] text-ink-soft">{job.jobId}</p>
                      <Badge
                        tone={job.status === 'running' ? 'success' : 'neutral'}
                        dot={false}
                      >
                        {job.status}
                      </Badge>
                    </div>
                    <div className="h-[5px] w-full rounded-pill bg-surface-soft">
                      <div
                        className="h-full rounded-pill bg-green"
                        style={{
                          width: `${job.total === 0 ? 0 : Math.round((job.done / job.total) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-small text-ink-soft">
                      <span>
                        {job.done}/{job.total} · {job.sent} terkirim · {job.failed} gagal
                      </span>
                      {session ? (
                        <Link
                          to="/numbers/$sessionId"
                          params={{ sessionId: session[0] }}
                          className="flex items-center gap-1 text-[11px] font-medium text-ink hover:underline"
                        >
                          {session[1]?.publicId ?? 'detail'}
                          <ArrowUpRight className="size-3" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <p className="mt-4 font-data text-[9.5px] text-ink-faint">
            Dikirim dengan delay {DEFAULT_MIN_DELAY_SECONDS}–{DEFAULT_MAX_DELAY_SECONDS} detik
          </p>
        </div>

        <div className="flex min-h-[252px] flex-col rounded-card border border-line bg-surface p-card lg:w-[416px]">
          <div className="flex items-center justify-between">
            <p className="font-data text-label tracking-[1.4px] text-ink-faint uppercase">
              Status service
            </p>
            <Badge tone={healthy ? 'success' : 'warning'} dot={false}>
              {health.data?.status === 'degraded' ? 'DEGRADED' : healthy ? 'OK' : '—'}
            </Badge>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <p className="text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {health.data?.name ?? 'WA Bot Console'}
            </p>
            <p className="pb-0.5 font-data text-[10.5px] text-ink-faint">
              {health.data?.version ?? 'v—'}
            </p>
          </div>
          <p className="mt-1 text-small text-ink-soft">
            {health.error
              ? 'Service tidak merespons'
              : health.data?.status === 'degraded'
                ? 'Dependensi bermasalah (database/redis)'
                : 'Terhubung ke API service'}
          </p>

          <div className="mt-4 flex gap-[5px]">
            {Array.from({ length: segments }, (_, index) => (
              <span
                key={index}
                className={`h-[26px] flex-1 rounded-[5px] ${
                  index < connected ? 'bg-green' : 'bg-surface-soft'
                }`}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-small">
            <p className="text-ink-soft">{connected} nomor terhubung</p>
            <p className="text-ink-faint">dari {total} sesi</p>
          </div>

          <div className="flex-1" />

          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={refresh}>
              <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
              Refresh
            </Button>
            <p className="font-data text-[9.5px] text-ink-faint">
              live 20s
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-line bg-surface pt-5 pb-2">
        <div className="flex items-center justify-between gap-4 px-[22px]">
          <div className="flex items-center gap-2.5">
            <p className="text-[14.5px] font-semibold tracking-[-0.2px] text-ink">Nomor WhatsApp</p>
            <p className="font-data text-[9.5px] text-ink-faint">{total} sesi</p>
          </div>
          <Link
            to="/numbers"
            className="flex items-center gap-1 text-small font-medium text-ink hover:underline"
          >
            Kelola nomor
            <ArrowUpRight className="size-3" aria-hidden />
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="px-[22px] py-8 text-center text-small text-ink-faint">
            Belum ada sesi. Tambahkan nomor dari menu Nomor.
          </p>
        ) : (
          <div className="mt-3.5 px-[22px]">
            <Table>
              <TableHead>
                <tr className="h-8">
                  <TableHeaderCell>SESSION</TableHeaderCell>
                  <TableHeaderCell className="w-[180px]">PUBLIC ID</TableHeaderCell>
                  <TableHeaderCell className="w-[140px]">STATUS</TableHeaderCell>
                  <TableHeaderCell className="w-[180px] text-left">
                    TERAKHIR TERHUBUNG
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {items.slice(0, 5).map((session) => (
                  <TableRow key={session.id} className="h-[46px]">
                    <TableCell>
                      <p className="font-data text-small font-medium text-ink">{session.label}</p>
                      <p className="font-data text-[9.5px] text-ink-faint">
                        {session.phoneNumber ?? '—'}
                      </p>
                    </TableCell>
                    <TableCell className="font-data text-[10.5px] text-ink-soft">
                      {session.publicId}
                    </TableCell>
                    <TableCell>
                      <SessionStatusBadge status={session.status} />
                    </TableCell>
                    <TableCell className="font-data text-[10.5px] text-ink-soft">
                      {formatDateTime(session.lastConnectedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
