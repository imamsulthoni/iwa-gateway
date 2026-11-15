import { Info } from 'lucide-react'
import { useState } from 'react'

import { Button, cn } from '../design-system'
import { api } from '../lib/api'
import type { SessionTokenDto } from '../lib/types'
import { Modal } from './dialogs'

const INPUT =
  'h-11 w-full rounded-[10px] border border-line-strong bg-surface px-[13px] font-data text-small text-ink outline-none transition placeholder:text-ink-faint focus:border-ink'
const LABEL = 'font-data text-label tracking-[1.1px] text-ink-soft uppercase'

type AddSessionDialogProps = {
  open: boolean
  onClose: () => void
  onCreated: (result: SessionTokenDto) => void
}

type Mode = 'qr' | 'pairing'

export function AddSessionDialog({ open, onClose, onCreated }: AddSessionDialogProps) {
  const [publicId, setPublicId] = useState('')
  const [salesId, setSalesId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [mode, setMode] = useState<Mode>('qr')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phone = phoneNumber.replace(/\D/g, '')
  const canSubmit =
    /^[A-Za-z0-9_-]{1,32}$/.test(publicId.trim()) &&
    (mode === 'qr' || (phone.length >= 8 && phone.length <= 15))

  function close() {
    setError(null)
    onClose()
  }

  function reset() {
    setPublicId('')
    setSalesId('')
    setAgentId('')
    setMode('qr')
    setPhoneNumber('')
    setError(null)
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<SessionTokenDto>('/sessions', {
        label: publicId.trim(),
        publicId: publicId.trim(),
        mode,
        phoneNumber: mode === 'pairing' ? phone : undefined,
        salesId: salesId.trim() || undefined,
        agentId: agentId.trim() || undefined,
      })
      reset()
      onCreated(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal membuat sesi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Tambah nomor baru"
      description="Buat sesi baru, lalu hubungkan perangkat lewat QR atau kode pairing."
      onClose={close}
      footer={
        <>
          <p className="font-data text-[9px] text-ink-faint">Token sesi ditampilkan sekali.</p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Batal
            </Button>
            <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
              {busy ? 'Membuat...' : 'Buat sesi'}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Session ID</span>
          <input
            value={publicId}
            onChange={(event) => setPublicId(event.target.value)}
            placeholder="mis. sales-jakarta-06"
            className={INPUT}
            autoFocus
          />
          <span className="text-note text-ink-faint">
            1–32 karakter · huruf, angka, garis bawah, atau tanda hubung.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Sales ID (opsional)</span>
          <input
            value={salesId}
            onChange={(event) => setSalesId(event.target.value)}
            placeholder="mis. rani-sales"
            className={INPUT}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Agent ID (opsional)</span>
          <input
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            placeholder="mis. rani@ops"
            className={INPUT}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className={LABEL}>Metode login</span>
          <div className="flex gap-2.5">
            <MethodCard
              title="Scan QR"
              description="Tampilkan QR di halaman sesi."
              active={mode === 'qr'}
              onClick={() => setMode('qr')}
            />
            <MethodCard
              title="Kode pairing"
              description="Masukkan nomor WhatsApp tujuan."
              active={mode === 'pairing'}
              onClick={() => setMode('pairing')}
            />
          </div>
        </div>

        {mode === 'pairing' ? (
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Nomor WhatsApp</span>
            <input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="628123456789"
              inputMode="numeric"
              className={INPUT}
            />
            <span className="text-note text-ink-faint">
              8–15 digit, format internasional tanpa tanda +.
            </span>
          </label>
        ) : null}

        {error ? (
          <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{error}</p>
        ) : null}

        <div className="flex items-start gap-[7px] rounded-[9px] bg-bg px-[11px] py-[9px]">
          <Info className="mt-px size-3 shrink-0 text-ink-faint" aria-hidden />
          <p className="text-[10.5px] text-ink-soft">
            QR dan kode pairing muncul di tab Koneksi setelah sesi dibuat.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function MethodCard({
  title,
  description,
  active,
  onClick,
}: {
  title: string
  description: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex flex-1 flex-col gap-1 rounded-[10px] border px-3.5 py-3 text-left transition',
        active
          ? 'border-ink bg-surface'
          : 'border-line bg-bg text-ink-soft hover:border-line-strong',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-ink">{title}</span>
        <span
          className={cn(
            'flex size-3 items-center justify-center rounded-pill border',
            active ? 'border-ink bg-ink' : 'border-line-strong bg-surface',
          )}
        >
          {active ? <span className="size-1 rounded-pill bg-white" /> : null}
        </span>
      </span>
      <span className="text-[10.5px] leading-[1.45] text-ink-soft">{description}</span>
    </button>
  )
}