import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, KeyRound, LogOut, RefreshCw } from 'lucide-react'
import { useRef, useState } from 'react'

import { ConfirmDialog } from '../../components/dialogs'
import { BroadcastTab } from '../../components/session/BroadcastTab'
import { KoneksiTab } from '../../components/session/KoneksiTab'
import { KirimTab } from '../../components/session/KirimTab'
import { RiwayatTab } from '../../components/session/RiwayatTab'
import { SessionStatusBadge } from '../../components/session-status'
import { TokenDialog } from '../../components/token-dialog'
import { Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { formatPhone, usePolling } from '../../lib/format'
import type { BroadcastCurrentDto, SessionLiveDto, SessionTokenDto } from '../../lib/types'

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
  skipped: 0,
  optedOut: 0,
  scheduledAt: null,
  pauseReason: null,
  recipients: [],
}

function SessionDetailPage() {
  const { sessionId } = Route.useParams()
  const navigate = useNavigate()
  const admin = isAdmin()
  const tabs = admin ? TABS : TABS.filter((item) => item.id === 'koneksi' || item.id === 'riwayat')
  const [tab, setTab] = useState<TabId>('koneksi')
  const [tokenResult, setTokenResult] = useState<SessionTokenDto | null>(null)
  const [confirm, setConfirm] = useState<'logout' | 'delete' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const intervalRef = useRef(3_000)
  const live = usePolling<SessionLiveDto>(
    () => api.get<SessionLiveDto>(`/sessions/${sessionId}/live`),
    intervalRef.current,
    true,
  )
  // Polling rapat hanya saat pairing; sesi terhubung cukup 15 detik sekali.
  intervalRef.current = live.data?.session.status === 'connected' ? 15_000 : 3_000

  const data = live.data?.session
  const broadcastCurrent = live.data?.broadcast ?? EMPTY_BROADCAST

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
    live.refresh()
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

  if (live.error) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{live.error}</p>
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
    return <p className="px-[22px] py-10 text-center text-small text-ink-faint">Memuat sesi...</p>
  }

  const broadcastCount = broadcastCurrent.jobId ? 1 : 0
  const meta = [data.label, data.salesName, formatPhone(data.phoneNumber)]
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
            <SessionStatusBadge status={data.status} />
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
            Refresh
          </Button>
          {admin ? (
            <>
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
                disabled={busy || data.status === 'logged_out'}
                onClick={() => setConfirm('logout')}
              >
                <LogOut className="size-[13px] text-ink-soft" aria-hidden />
                Logout
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="h-5" />

      <div className="flex w-full items-end gap-[26px] border-b border-line">
        {tabs.map((item) => {
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
        <p className="pb-3 font-data text-[9px] text-ink-faint">status diperbarui tiap 3 detik</p>
      </div>

      <div className="h-5" />

      {actionError ? (
        <p className="mb-4 rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{actionError}</p>
      ) : null}

      {tab === 'koneksi' ? (
        <KoneksiTab
          session={data}
          salesName={data.salesName}
          readOnly={!admin}
          broadcast={broadcastCurrent}
          qr={live.data?.qr ?? null}
          pairingCode={live.data?.pairingCode ?? null}
          onRefresh={refreshAll}
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
