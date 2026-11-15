import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ConfirmDialog } from '../../components/dialogs'
import { BroadcastTab } from '../../components/session/BroadcastTab'
import { KoneksiTab } from '../../components/session/KoneksiTab'
import { KirimTab } from '../../components/session/KirimTab'
import { RiwayatTab } from '../../components/session/RiwayatTab'
import { SessionStatusBadge } from '../../components/session-status'
import { TokenDialog } from '../../components/token-dialog'
import { Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import { formatPhone, usePolling } from '../../lib/format'
import type {
  BroadcastCurrentDto,
  SessionDto,
  SessionStatusDto,
  SessionTokenDto,
} from '../../lib/types'

export const Route = createFileRoute('/_auth/numbers_/$sessionId')({
  component: SessionDetailPage,
})

const TABS = [
  { id: 'koneksi', label: 'Koneksi' },
  { id: 'kirim', label: 'Kirim' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'riwayat', label: 'Riwayat' },
] as const

type TabId = (typeof TABS)[number]['id']

const EMPTY_BROADCAST: BroadcastCurrentDto = {
  jobId: null,
  status: null,
  total: 0,
  done: 0,
  sent: 0,
  failed: 0,
  recipients: [],
}

function SessionDetailPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState<TabId>('koneksi')
  const [tokenResult, setTokenResult] = useState<SessionTokenDto | null>(null)
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [terminal, setTerminal] = useState(false)
  const detail = usePolling<SessionDto>(
    () => api.get<SessionDto>(`/sessions/${sessionId}`),
    15_000,
    true,
  )
  const status = usePolling<SessionStatusDto>(
    () => api.get<SessionStatusDto>(`/sessions/${sessionId}/status`),
    3_000,
    !terminal,
  )
  const broadcast = usePolling<BroadcastCurrentDto>(
    () => api.get<BroadcastCurrentDto>(`/sessions/${sessionId}/broadcast/current`),
    status.data?.status === 'connected' ? 3_000 : 10_000,
    true,
  )

  const data = detail.data
  const currentStatus = status.data

  useEffect(() => {
    if (status.data) {
      setTerminal(
        status.data.status === 'connected' || status.data.status === 'logged_out',
      )
    }
  }, [status.data])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      refreshAll()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Aksi gagal')
    } finally {
      setBusy(false)
    }
  }

  function refreshAll() {
    detail.refresh()
    status.refresh()
    broadcast.refresh()
  }

  function rotateToken() {
    void run(async () => {
      const result = await api.post<SessionTokenDto>(`/sessions/${sessionId}/token`)
      setTokenResult(result)
    })
  }

  function logoutSession() {
    void run(() => api.post(`/sessions/${sessionId}/logout`))
    setConfirm(null)
  }

  async function deleteSession() {
    await run(() => api.delete(`/sessions/${sessionId}`))
    setConfirm(null)
    await navigate({ to: '/numbers' })
  }

  if (detail.error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">
          {detail.error}
        </p>
        <Link
          to="/numbers"
          className="flex items-center gap-1.5 font-data text-[9.5px] text-ink-faint hover:text-ink"
        >
          <ArrowLeft className="size-3" aria-hidden />
          Kembali ke daftar nomor
        </Link>
      </div>
    )
  }

  if (!data) {
    return (
      <p className="px-[22px] py-10 text-center text-small text-ink-faint">Memuat sesi...</p>
    )
  }

  const broadcastCurrent = broadcast.data ?? EMPTY_BROADCAST
  const broadcastCount = broadcastCurrent.jobId ? 1 : 0
  const meta = [data.label, currentStatus?.agentId, formatPhone(data.phoneNumber)]
    .filter((value) => Boolean(value))
    .join('  ·  ')

  return (
    <div className="flex flex-col">
      <Link
        to="/numbers"
        className="flex items-center gap-[7px] font-data text-[9.5px] tracking-[0.6px] text-ink-faint hover:text-ink"
      >
        <ArrowLeft className="size-3" aria-hidden />
        Nomor
        <span className="text-ink-faint">/</span>
        <span className="text-ink">{data.publicId}</span>
      </Link>

      <div className="h-3.5" />

      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-[7px]">
          <div className="flex items-center gap-2.5">
            <h1 className="font-data text-title font-semibold tracking-[-1px] text-ink">
              {data.publicId}
            </h1>
            <SessionStatusBadge status={currentStatus?.status ?? data.status} />
          </div>
          <p className="text-[12px] text-ink-soft">{meta}</p>
        </div>

        <div className="flex items-center gap-[7px]">
          <Button
            variant="secondary"
            size="sm"
            className="h-[30px] px-[13px] text-[12px]"
            onClick={() => refreshAll()}
          >
            <RefreshCw className="size-[13px] text-ink-soft" aria-hidden />
            Segarkan
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-[30px] px-[13px] text-[12px]"
            disabled={busy}
            onClick={() => rotateToken()}
          >
            <KeyRound className="size-[13px] text-ink-soft" aria-hidden />
            Rotasi token
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-[30px] px-[13px] text-[12px]"
            disabled={busy || currentStatus?.status === 'logged_out'}
            onClick={() => setConfirm('logout')}
          >
            <LogOut className="size-[13px] text-ink-soft" aria-hidden />
            Logout
          </Button>
        </div>
      </div>

      <div className="h-5" />

      <div className="flex w-full items-end gap-[26px] border-b border-line">
        {TABS.map((item) => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-0.5 pt-0 pr-0 pb-[11px] pl-0 text-[12.5px] transition',
                active
                  ? 'border-ink font-semibold text-ink'
                  : 'border-transparent font-medium text-ink-faint hover:text-ink-soft',
              )}
            >
              {item.label}
              {item.id === 'broadcast' && broadcastCount > 0 ? (
                <span className="rounded-pill bg-surface-soft px-1.5 py-px font-data text-[9px] text-ink-soft">
                  {broadcastCount}
                </span>
              ) : null}
            </button>
          )
        })}
        <span className="flex-1" />
        <p className="pb-3 font-data text-[9px] text-ink-faint">
          polling 3s saat belum terhubung
        </p>
      </div>

      <div className="h-5" />

      {actionError ? (
        <p className="mb-4 rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">
          {actionError}
        </p>
      ) : null}

      {tab === 'koneksi' ? (
        <KoneksiTab
          session={{ ...data, status: currentStatus?.status ?? data.status }}
          agentId={currentStatus?.agentId ?? null}
          broadcast={broadcastCurrent}
          onChanged={refreshAll}
          onDelete={() => setConfirm('delete')}
        />
      ) : null}
      {tab === 'kirim' ? <KirimTab session={data} onChanged={refreshAll} /> : null}
      {tab === 'broadcast' ? (
        <BroadcastTab session={data} broadcast={broadcastCurrent} onRefresh={refreshAll} />
      ) : null}
      {tab === 'riwayat' ? <RiwayatTab session={data} /> : null}

      <TokenDialog
        open={Boolean(tokenResult)}
        token={tokenResult?.token ?? null}
        publicId={tokenResult?.session.publicId ?? data.publicId}
        createdAt={tokenResult?.session.createdAt ?? null}
        onClose={() => setTokenResult(null)}
      />

      <ConfirmDialog
        open={confirm === 'logout'}
        title="Logout sesi"
        message="Perangkat akan dilepas dan auth state dihapus. Lanjutkan?"
        confirmLabel="Logout"
        onCancel={() => setConfirm(null)}
        onConfirm={() => logoutSession()}
      />

      <ConfirmDialog
        open={confirm === 'delete'}
        title="Hapus sesi"
        message="Sesi, auth state, dan riwayat pesan akan dihapus permanen. Lanjutkan?"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void deleteSession()}
      />
    </div>
  )
}
