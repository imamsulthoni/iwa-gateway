import { MESSAGE_STATUS_LABELS } from '@wa/shared'
import { ArrowUpRight, Copy, Hash, QrCode, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import { getDefaultDelay } from '../../lib/delay'
import { formatDateTime, phoneFromJid } from '../../lib/format'
import type { BroadcastCurrentDto, MessageListDto, SessionDto } from '../../lib/types'
import { BroadcastRail, CardLabel, FIELD_INPUT, Panel, StatusDot } from './parts'

type KoneksiTabProps = {
  session: SessionDto
  agentId: string | null
  broadcast: BroadcastCurrentDto
  qr: string | null
  pairingCode: string | null
  onRefresh: () => void
  onChanged: () => void
  onDelete: () => void
}

export function KoneksiTab({
  session,
  agentId,
  broadcast,
  qr,
  pairingCode,
  onRefresh,
  onChanged,
  onDelete,
}: KoneksiTabProps) {
  const [phone, setPhone] = useState(session.phoneNumber ?? '')

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const connected = session.status === 'connected'
  const loggedOut = session.status === 'logged_out'

  const recent = useRecentMessages(session.id, connected)

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi gagal')
    } finally {
      setBusy(false)
    }
  }

  async function requestPairing() {
    await run(() =>
      api.post(`/sessions/${session.id}/pairing`, { phoneNumber: phone.replace(/\D/g, '') }),
    )
  }

  async function login() {
    await run(() => api.post(`/sessions/${session.id}/login`))
  }

  async function cancelPairing() {
    setBusy(true)
    setError(null)
    try {
      await api.post(`/sessions/${session.id}/cancel`)
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membatalkan pairing')
    } finally {
      setBusy(false)
    }
  }

  const meta = (
    <>
      <div className="flex gap-4 py-[11px]">
        <MetaCell label="Sales" value={session.label} />
        <MetaCell label="Agent ID" value={agentId ?? '—'} />
      </div>
      <div className="h-px w-full bg-line" />
      <div className="flex gap-4 py-[11px]">
        <MetaCell label="Dibuat" value={formatDateTime(session.createdAt)} />
        <MetaCell label="Terakhir aktif" value={formatDateTime(session.lastConnectedAt)} />
      </div>
    </>
  )

  const deleteCard = (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-[18px]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-[3px]">
          <p className="text-[12.5px] font-semibold text-ink">Hapus sesi</p>
          <p className="text-[11px] leading-[1.45] text-ink-soft">
            Menghapus sesi akan menghentikan semua pengiriman dan tidak bisa dibatalkan.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 border-line text-red hover:bg-red-soft"
          onClick={onDelete}
        >
          <Trash2 className="size-[13px]" aria-hidden />
          Hapus sesi
        </Button>
      </div>
    </div>
  )

  const rail = (
    <div className="flex w-full flex-col gap-4">
      <BroadcastRail broadcast={broadcast} />

      <Link
        to="/settings"
        className="flex flex-col rounded-card border border-line bg-surface p-[18px] transition hover:border-line-strong"
      >
        <CardLabel>Delay broadcast default</CardLabel>
        <div className="h-2.5" />
        <div className="flex items-center justify-between">
          <div className="flex items-end gap-1.5">
            <span className="text-[22px] font-semibold tracking-[-0.6px] text-ink">
              {getDefaultDelay().min}–{getDefaultDelay().max}
            </span>
            <span className="pb-0.5 text-[11px] text-ink-soft">detik</span>
          </div>
          <ArrowUpRight className="size-[13px] text-ink-faint" aria-hidden />
        </div>
        <div className="h-1" />
        <p className="text-[10.5px] leading-[1.45] text-ink-faint">
          Dipakai sebagai nilai awal form broadcast. Ubah di Pengaturan.
        </p>
      </Link>
    </div>
  )

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex w-[720px] max-w-full flex-col gap-4">
        {error ? (
          <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{error}</p>
        ) : null}

        {connected ? (
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <StatusDot tone="green" />
                  <h2 className="text-[19px] font-semibold tracking-[-0.5px] text-ink">Terhubung</h2>
                </div>
                <p className="text-small text-ink-soft">
                  Sesi aktif dan siap menerima perintah kirim.
                </p>
              </div>
              <p className="font-data text-[9.5px] text-ink-faint">
                sejak {formatDateTime(session.lastConnectedAt)}
              </p>
            </div>
            <div className="h-[18px]" />
            <div className="flex items-center justify-between gap-3 rounded-[10px] bg-bg px-[13px] py-[11px]">
              <div className="flex min-w-0 flex-col gap-[3px]">
                <p className="font-data text-[8.5px] tracking-[1.1px] text-ink-faint uppercase">
                  Nomor login
                </p>
                <p className="truncate font-data text-small text-ink">
                  {session.phoneNumber ? `${session.phoneNumber}@s.whatsapp.net` : '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(session.phoneNumber ?? '')}
                aria-label="Salin nomor"
                className="text-ink-soft transition hover:text-ink"
              >
                <Copy className="size-[13px]" aria-hidden />
              </button>
            </div>
            <div className="h-4" />
            {meta}
          </Panel>
        ) : (
          <Panel>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <StatusDot tone={loggedOut ? 'faint' : 'amber'} />
                  <h2 className="text-[19px] font-semibold tracking-[-0.5px] text-ink">
                    {loggedOut
                      ? 'Sesi keluar'
                      : session.status === 'disconnected'
                        ? 'Koneksi terputus'
                        : 'Menunggu scan'}
                  </h2>
                </div>
                <p className="text-small text-ink-soft">
                  {loggedOut
                    ? 'Perangkat sudah dilepas. Login ulang untuk menautkan nomor.'
                    : session.status === 'disconnected'
                      ? 'Pairing dibatalkan. Klik Scan QR untuk membuat QR baru.'
                      : 'QR diperbarui otomatis selama perangkat belum tertaut.'}
                </p>
              </div>
              <p className="font-data text-[9.5px] text-ink-faint">polling 3 detik</p>
            </div>

            <div className="h-5" />

            {loggedOut ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-[9px] rounded-[10px] bg-amber-soft px-3 py-3">
                  <ShieldCheck className="mt-px size-3.5 shrink-0 text-amber" aria-hidden />
                  <p className="text-[11px] leading-[1.45] text-amber">
                    Sesi tidak bisa mengirim pesan sampai perangkat ditautkan kembali.
                  </p>
                </div>
                <Button
                  className="self-start"
                  disabled={busy}
                  onClick={() => void login()}
                >
                  Login ulang
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-[26px]">
                <div className="flex size-[232px] items-center justify-center rounded-xl border border-line bg-surface p-3.5">
                  {qr ? (
                    <img src={qr} alt="QR WhatsApp" className="size-[204px]" />
                  ) : (
                    <div className="flex size-[204px] flex-col items-center justify-center gap-2 text-center">
                      <QrCode className="size-8 text-ink-faint" aria-hidden />
                      <p className="text-note text-ink-faint">
                        {session.status === 'disconnected'
                          ? 'Koneksi terputus. Klik Scan QR di bawah untuk QR baru.'
                          : 'Menunggu QR dari worker...'}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex min-w-[260px] flex-1 flex-col">
                  <p className="text-sm font-semibold tracking-[-0.2px] text-ink">
                    Scan dengan WhatsApp
                  </p>
                  <div className="h-3.5" />
                  {[
                    'Buka WhatsApp di ponsel',
                    'Pilih Pengaturan → Perangkat tertaut',
                    'Ketuk Tautkan perangkat, lalu scan QR ini',
                  ].map((step, index) => (
                    <div key={step} className="flex items-center gap-2.5 py-[7px]">
                      <span className="w-[22px] font-data text-[9.5px] text-ink-faint">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <p className="text-small text-ink-soft">{step}</p>
                    </div>
                  ))}
                  <div className="h-3.5" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-[30px] px-3 text-[11.5px]"
                      disabled={busy}
                      onClick={onRefresh}
                    >
                      <RefreshCw className="size-3 text-ink-soft" aria-hidden />
                      Muat ulang QR
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-[30px] px-3 text-[11.5px]"
                      onClick={() => document.getElementById('pairing-phone')?.focus()}
                    >
                      Pakai kode pairing
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-[30px] px-3 text-[11.5px]"
                      disabled={busy}
                      onClick={() => void cancelPairing()}
                    >
                      <X className="size-3 text-ink-soft" aria-hidden />
                      Batalkan
                    </Button>
                  </div>
                  <div className="h-[18px]" />
                  <div className="flex items-start gap-[7px] rounded-[9px] bg-bg px-3 py-2.5">
                    <ShieldCheck className="mt-px size-3 shrink-0 text-ink-faint" aria-hidden />
                    <p className="text-[10.5px] leading-[1.45] text-ink-soft">
                      Halaman ini otomatis berubah ke status terhubung setelah QR discan.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}

        {connected ? (
          <Panel>
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-semibold tracking-[-0.2px] text-ink">
                Aktivitas terbaru
              </h2>
              <p className="font-data text-[9px] tracking-[1.1px] text-ink-faint uppercase">
                {recent.items.length} event
              </p>
            </div>
            <div className="h-2.5" />
            {recent.items.length === 0 ? (
              <p className="py-3 text-small text-ink-faint">Belum ada aktivitas pengiriman.</p>
            ) : (
              recent.items.map((message, index) => (
                <div key={message.id}>
                  {index > 0 ? <div className="h-px w-full bg-line" /> : null}
                  <div className="flex items-center gap-2.5 py-[11px]">
                    <span className="flex size-4 items-center justify-center">
                      <span
                        className={cn(
                          'size-1.5 rounded-pill',
                          message.status === 'failed'
                            ? 'bg-red'
                            : message.status === 'queued'
                              ? 'bg-ink-faint'
                              : 'bg-green',
                        )}
                      />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                      <p className="text-small font-medium text-ink">
                        Pesan {MESSAGE_STATUS_LABELS[message.status].toLowerCase()}
                      </p>
                      <p className="truncate font-data text-[9.5px] text-ink-faint">
                        ke {phoneFromJid(message.to)} · {message.clientRef ?? '—'}
                      </p>
                    </div>
                    <p className="font-data text-[9.5px] text-ink-faint">
                      {clock(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </Panel>
        ) : null}

        {!loggedOut ? (
          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-[18px]">
            <div className="flex flex-col gap-[3px]">
              <p className="text-[12.5px] font-semibold text-ink">Login ulang / ganti nomor</p>
              <p className="text-[11px] text-ink-soft">
                Hubungkan perangkat lewat QR atau kode pairing 8 digit.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-[7px]">
              <Button
                variant="secondary"
                size="sm"
                className="h-[30px] px-3 text-[11.5px]"
                disabled={busy}
                onClick={() => void login()}
              >
                <QrCode className="size-3 text-ink-soft" aria-hidden />
                Scan QR
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-[30px] px-3 text-[11.5px]"
                onClick={() => document.getElementById('pairing-phone')?.focus()}
              >
                <Hash className="size-3 text-ink-soft" aria-hidden />
                Kode pairing
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-[320px] flex-1 flex-col gap-4">
        {connected ? (
          rail
        ) : (
          <>
            <Panel className="gap-0 p-5" >
              <div className="flex items-center justify-between">
                <CardLabel>Atau kode pairing</CardLabel>
                <Hash className="size-[13px] text-ink-faint" aria-hidden />
              </div>
              <div className="h-3" />
              {pairingCode ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-data text-2xl font-semibold tracking-[3px] text-ink">
                      {pairingCode}
                    </p>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard?.writeText(pairingCode)}
                      aria-label="Salin kode pairing"
                      className="text-ink-soft transition hover:text-ink"
                    >
                      <Copy className="size-3" aria-hidden />
                    </button>
                  </div>
                  <div className="h-2.5" />
                  <p className="text-[10.5px] leading-[1.45] text-ink-soft">
                    Masukkan kode ini di WhatsApp → Perangkat tertaut → Tautkan dengan nomor
                    telepon.
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-[10.5px] leading-[1.45] text-ink-soft">
                    Masukkan nomor WhatsApp untuk meminta kode pairing 8 digit.
                  </p>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    id="pairing-phone"
                    placeholder="628123456789"
                    inputMode="numeric"
                    className={cn(FIELD_INPUT, 'h-10')}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-[32px] self-start px-3.5 text-[11.5px]"
                    disabled={busy || phone.replace(/\D/g, '').length < 8}
                    onClick={() => void requestPairing()}
                  >
                    Minta kode
                  </Button>
                </div>
              )}
            </Panel>

            <Panel className="gap-0 p-5">
              <CardLabel>Detail sesi</CardLabel>
              <div className="h-2.5" />
              <SummaryRow label="Public ID" value={session.publicId} />
              <div className="h-px w-full bg-line" />
              <SummaryRow label="Sales" value={session.label} />
              <div className="h-px w-full bg-line" />
              <SummaryRow label="Agent ID" value={agentId ?? '—'} />
              <div className="h-px w-full bg-line" />
              <SummaryRow label="Dibuat" value={formatDateTime(session.createdAt)} />
            </Panel>

            {deleteCard}

            <div className="flex items-start gap-[9px] rounded-card border border-line bg-surface p-4">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-ink-faint" aria-hidden />
              <p className="text-[10.5px] leading-[1.45] text-ink-soft">
                Jangan bagikan QR atau kode pairing. Siapa pun yang memindainya bisa mengakses
                nomor ini.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col gap-1">
      <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</p>
      <p className="text-small text-ink">{value}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</p>
      <p className="truncate text-small text-ink">{value}</p>
    </div>
  )
}

function clock(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function useRecentMessages(sessionId: string, connected: boolean) {
  const [items, setItems] = useState<MessageListDto['items']>([])

  useEffect(() => {
    if (!connected) return
    let active = true
    api
      .get<MessageListDto>(`/sessions/${sessionId}/messages?limit=4&direction=out`)
      .then((page) => {
        if (active) setItems(page.items)
      })
      .catch(() => {
        if (active) setItems([])
      })
    return () => {
      active = false
    }
  }, [sessionId, connected])

  return { items }
}