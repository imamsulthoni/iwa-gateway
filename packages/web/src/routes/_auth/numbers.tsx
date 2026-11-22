import { SESSION_STATUS_LABELS } from '@wbc/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Info, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AddSessionDialog } from '../../components/add-session-dialog'
import { ConfirmDialog } from '../../components/dialogs'
import { SessionStatusBadge } from '../../components/session-status'
import { TokenDialog } from '../../components/token-dialog'
import { Button, Select, cn } from '../../design-system'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { formatDateTime, formatPhone, usePolling } from '../../lib/format'
import type { SessionListDto, SessionTokenDto } from '../../lib/types'

export const Route = createFileRoute('/_auth/numbers')({
  component: NumbersPage,
})

const GRID = 'grid grid-cols-[minmax(0,1fr)_180px_120px_170px_112px] items-center'
const STATUS_OPTIONS = [{ value: 'all', label: 'Semua status' }].concat(
  Object.entries(SESSION_STATUS_LABELS).map(([value, label]) => ({ value, label })),
)

function NumbersPage() {
  const navigate = useNavigate()
  const admin = isAdmin()
  const sessions = usePolling(() => api.get<SessionListDto>('/v1/sessions'), 10_000, true)
  const [createOpen, setCreateOpen] = useState(false)
  const [tokenResult, setTokenResult] = useState<SessionTokenDto | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [deleteTarget, setDeleteTarget] = useState<SessionListDto['items'][number] | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const items = sessions.data?.items ?? []
  const connected = items.filter((item) => item.status === 'connected').length
  const error = sessions.error ?? deleteError

  function refresh() {
    sessions.refresh()
  }

  async function deleteSession() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete(`/v1/sessions/${deleteTarget.id}`)
      setDeleteTarget(null)
      refresh()
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : 'Gagal menghapus sesi')
    } finally {
      setDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => {
      const matchStatus = status === 'all' || item.status === status
      const matchQuery =
        !needle ||
        item.publicId.toLowerCase().includes(needle) ||
        item.label.toLowerCase().includes(needle) ||
        (item.phoneNumber ?? '').includes(needle)
      return matchStatus && matchQuery
    })
  }, [items, query, status])

  return (
    <div className="flex flex-col">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-data text-[9.5px] tracking-[1.6px] text-ink-faint uppercase">
            Nomor / Sessions
          </p>
          <h1 className="text-heading text-ink">Nomor WhatsApp</h1>
          <p className="text-body text-ink-soft">Kelola sesi dan QR WhatsApp.</p>
        </div>

        <div className="flex items-center gap-2.5">
          <p className="font-data text-[9.5px] text-ink-faint">
            {items.length} sesi · {connected} terhubung
          </p>
          <Button
            variant="secondary"
            className="h-[34px] px-3.5 text-[12.5px]"
            onClick={() => refresh()}
          >
            <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
            Refresh
          </Button>
          {admin ? (
            <Button className="h-[34px] px-4 text-[12.5px]" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden />
              Tambah nomor
            </Button>
          ) : null}
        </div>
      </div>

      <div className="h-[26px]" />

      <section className="flex flex-col rounded-card border border-line bg-surface pt-5">
        <div className="flex items-center justify-between px-[22px]">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Semua sesi</h2>
            <p className="text-small text-ink-faint">Satu sesi mewakili satu nomor WhatsApp.</p>
          </div>
        </div>

        <div className="h-4" />

        <div className="flex items-center justify-between gap-4 px-[22px]">
          <div className="flex items-center gap-2">
            <div className="flex h-[38px] w-[300px] items-center gap-2 rounded-[10px] bg-bg px-3 text-ink-faint">
              <Search className="size-3.5 shrink-0" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="CARI SESSION ID ATAU SALES"
                aria-label="Cari sesi"
                className="w-full bg-transparent font-data text-[9.5px] tracking-[0.8px] text-ink uppercase outline-none placeholder:text-ink-faint"
              />
            </div>
            <Select
              label="Filter status"
              className="w-[150px]"
              value={status}
              onChange={setStatus}
              options={STATUS_OPTIONS}
            />
          </div>
          <p className="font-data text-[9.5px] text-ink-faint">polling tiap 10 detik</p>
        </div>

        <div className="h-4" />

        <div className={cn(GRID, 'h-8 px-[22px]')}>
          <p className={COL_HEAD}>Session</p>
          <p className={COL_HEAD}>Sales</p>
          <p className={COL_HEAD}>Status</p>
          <p className={COL_HEAD}>Terakhir terhubung</p>
          <p className={cn(COL_HEAD, 'text-right')}>Aksi</p>
        </div>
        <div className="h-px w-full bg-line" />

        {error ? <p className="px-[22px] py-6 text-small text-red">{error}</p> : null}

        {!error && filtered.length === 0 ? (
          <p className="px-[22px] py-10 text-center text-small text-ink-faint">
            {items.length === 0
              ? admin
                ? 'Belum ada sesi. Tambahkan nomor untuk memulai.'
                : 'Belum ada nomor untuk akun ini. Hubungi admin.'
              : 'Tidak ada sesi yang cocok dengan filter.'}
          </p>
        ) : null}

        {filtered.map((session, index) => (
          <div key={session.id}>
            {index > 0 ? <div className="h-px w-full bg-line" /> : null}
            <div className={cn(GRID, 'h-16 px-[22px]')}>
              <div className="flex min-w-0 flex-col gap-[3px]">
                <p className="truncate font-data text-small font-medium text-ink">
                  {session.publicId}
                </p>
                <p className="font-data text-[9.5px] text-ink-faint">
                  {formatPhone(session.phoneNumber)}
                </p>
              </div>
              <p className="truncate text-body text-ink">{session.salesName ?? '—'}</p>
              <div>
                <SessionStatusBadge status={session.status} />
              </div>
              <p className="font-data text-[10.5px] text-ink-soft">
                {formatDateTime(session.lastConnectedAt)}
              </p>
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-[26px] px-[11px] text-[11px]"
                  onClick={() =>
                    void navigate({
                      to: '/numbers/$sessionId',
                      params: { sessionId: session.id },
                    })
                  }
                >
                  Buka
                </Button>
                {admin && session.status !== 'connected' ? (
                  <Button
                    variant="destructive"
                    size="icon"
                    className="size-7!"
                    aria-label={`Hapus sesi ${session.publicId}`}
                    title="Hapus sesi"
                    onClick={() => setDeleteTarget(session)}
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between border-t border-line px-[22px] py-3.5">
          <p className="text-[11px] text-ink-soft">
            Menampilkan {filtered.length} dari {items.length} sesi
          </p>
          <p className="font-data text-[9.5px] text-ink-faint">polling tiap 10 detik</p>
        </div>
      </section>

      <div className="h-[26px]" />

      <div className="flex flex-wrap gap-4">
        <div className="flex w-[680px] max-w-full flex-col rounded-card border border-line bg-surface p-card">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-semibold tracking-[-0.2px] text-ink">Alur koneksi</h2>
            <p className="font-data text-[9px] tracking-[1.1px] text-ink-faint">3 LANGKAH</p>
          </div>
          <div className="h-4" />
          <div className="flex gap-5">
            {[
              ['01', 'Buat sesi', 'Tentukan Session ID, nama sales, dan PIN.'],
              ['02', 'Hubungkan', 'Scan QR dari tab Koneksi.'],
              ['03', 'Siap kirim', 'Kirim pesan tunggal atau broadcast.'],
            ].map(([num, title, desc], index) => (
              <div key={num} className="flex flex-1 gap-5">
                {index > 0 ? <span className="h-[84px] w-px shrink-0 bg-line" /> : null}
                <div className="flex flex-col gap-1.5">
                  <p className="font-data text-[9.5px] tracking-[0.8px] text-ink-faint">{num}</p>
                  <p className="text-[13px] font-semibold text-ink">{title}</p>
                  <p className="text-[11px] leading-normal text-ink-soft">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex w-[416px] max-w-full flex-col rounded-card border border-line bg-surface p-card">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-semibold tracking-[-0.2px] text-ink">Catatan sesi</h2>
            <Info className="size-3.5 text-ink-faint" aria-hidden />
          </div>
          <div className="h-3" />
          {[
            'Session ID unik, 1–32 karakter.',
            'Token sesi hanya tampil satu kali.',
            'Pesan masuk tidak dicatat oleh service.',
          ].map((note) => (
            <div key={note} className="flex gap-2 py-[5px]">
              <span className="font-data text-[10px] text-ink-faint">—</span>
              <p className="text-small leading-[1.45] text-ink-soft">{note}</p>
            </div>
          ))}
        </div>
      </div>

      <AddSessionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) => {
          setCreateOpen(false)
          setTokenResult(result)
          refresh()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Hapus sesi"
        message={`Sesi ${deleteTarget?.publicId ?? ''}, auth state, dan riwayat pesan akan dihapus permanen. Lanjutkan?`}
        confirmLabel="Hapus"
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void deleteSession()}
      />

      <TokenDialog
        open={Boolean(tokenResult)}
        token={tokenResult?.token ?? null}
        publicId={tokenResult?.session.publicId ?? ''}
        createdAt={tokenResult?.session.createdAt ?? null}
        onClose={() => {
          const session = tokenResult?.session
          setTokenResult(null)
          if (session) {
            void navigate({ to: '/numbers/$sessionId', params: { sessionId: session.id } })
          }
        }}
      />
    </div>
  )
}

const COL_HEAD = 'font-data text-[9px] tracking-[1.1px] text-ink-soft uppercase'
