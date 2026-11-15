import { DEFAULT_MAX_DELAY_SECONDS, DEFAULT_MIN_DELAY_SECONDS } from '@wa/shared'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, ChevronDown, Megaphone, RefreshCw } from 'lucide-react'

import {
  Badge,
  Button,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../design-system'
import { SessionStatusBadge } from '../../components/session-status'
import { api } from '../../lib/api'
import { isPreviewMode } from '../../lib/auth'
import { formatDateTime, formatNumber, usePolling } from '../../lib/format'
import type { HealthDto, SessionListDto, StatsDto } from '../../lib/types'

export const Route = createFileRoute('/_auth/overview')({
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

function OverviewPage() {
  const preview = isPreviewMode()
  const navigate = useNavigate()
  const stats = usePolling(() => api.get<StatsDto>('/stats'), 15_000, !preview)
  const sessions = usePolling(() => api.get<SessionListDto>('/sessions'), 15_000, !preview)
  const health = usePolling(() => api.get<HealthDto>('/'), 20_000, !preview)

  const items = sessions.data?.items ?? []
  const total = items.length
  const connected = items.filter((item) => item.status === 'connected').length
  const today = stats.data?.todayMessages ?? 0
  const totalMessages = stats.data?.totalMessages ?? 0
  const running = stats.data?.runningBroadcasts ?? 0
  const healthy = health.data?.status === 'ok'
  const segments = Math.max(total, 5)

  const error = stats.error ?? sessions.error ?? health.error

  function refresh() {
    stats.refresh()
    sessions.refresh()
    health.refresh()
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
            <Button variant="secondary" onClick={refresh} disabled={preview}>
              <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
              Segarkan
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
          <span className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-[5px] text-small font-medium text-ink">
            Hari ini
            <ChevronDown className="size-3 text-ink-soft" aria-hidden />
          </span>
        </div>

        <div className="mt-3.5 flex items-end gap-3.5">
          <p className="text-[56px] leading-[0.95] font-semibold tracking-[-2.4px] text-ink">
            {formatNumber(today)}
          </p>
          <p className="pb-1.5 text-body text-ink-soft">pesan terkirim hari ini</p>
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

          <div className="mt-4 flex flex-1 items-center justify-center rounded-lg border border-dashed border-line px-4 py-8 text-center text-small text-ink-faint">
            {running > 0
              ? 'Detail broadcast belum tersedia di versi ini.'
              : 'Belum ada broadcast berjalan.'}
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
              {healthy ? 'OK' : 'DEGRADED'}
            </Badge>
          </div>

          <div className="mt-4 flex items-end gap-2">
            <p className="text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {health.data?.name ?? 'wa-gateway'}
            </p>
            <p className="pb-0.5 font-data text-[10.5px] text-ink-faint">
              {health.data?.version ?? 'v—'}
            </p>
          </div>
          <p className="mt-1 text-small text-ink-soft">
            {health.error ? 'Service tidak merespons' : 'Terhubung ke API service'}
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
            <Button variant="secondary" onClick={refresh} disabled={preview}>
              <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
              Segarkan
            </Button>
            <p className="font-data text-[9.5px] text-ink-faint">
              {preview ? 'pratinjau' : 'live 20s'}
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
          <div className="mt-3.5">
            <Table>
              <TableHead>
                <tr className="h-8">
                  <TableHeaderCell className="pl-[22px]">SESSION</TableHeaderCell>
                  <TableHeaderCell className="w-[150px]">PUBLIC ID</TableHeaderCell>
                  <TableHeaderCell className="w-[150px]">STATUS</TableHeaderCell>
                  <TableHeaderCell className="w-[160px] pr-[22px] text-right">
                    TERAKHIR TERHUBUNG
                  </TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {items.slice(0, 5).map((session) => (
                  <TableRow key={session.id} className="h-[46px]">
                    <TableCell className="pl-[22px]">
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
                    <TableCell className="pr-[22px] text-right font-data text-[10.5px] text-ink-soft">
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
