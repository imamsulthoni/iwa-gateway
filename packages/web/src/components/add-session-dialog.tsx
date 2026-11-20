import { Eye, EyeOff, Info } from 'lucide-react'
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

export function AddSessionDialog({ open, onClose, onCreated }: AddSessionDialogProps) {
  const [publicId, setPublicId] = useState('')
  const [salesName, setSalesName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [pin, setPin] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const phone = phoneNumber.replace(/\D/g, '')
  const canSubmit =
    /^[A-Za-z0-9_-]{1,32}$/.test(publicId.trim()) &&
    salesName.trim().length > 0 &&
    phone.length >= 8 &&
    phone.length <= 15 &&
    /^\d{4,8}$/.test(pin)

  function close() {
    setError(null)
    onClose()
  }

  function reset() {
    setPublicId('')
    setSalesName('')
    setPhoneNumber('')
    setPin('')
    setReveal(false)
    setError(null)
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.post<SessionTokenDto>('/v1/sessions', {
        label: publicId.trim(),
        publicId: publicId.trim(),
        mode: 'qr',
        phoneNumber: phone,
        salesName: salesName.trim(),
        pin,
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
      description="Buat sesi baru bersama akun sales, lalu hubungkan perangkat lewat QR WhatsApp."
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
          <span className={LABEL}>Nama sales</span>
          <input
            value={salesName}
            onChange={(event) => setSalesName(event.target.value)}
            placeholder="mis. Rani"
            className={INPUT}
          />
        </label>

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
            8–15 digit, format internasional tanpa tanda +. Dipakai untuk login sales.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>PIN</span>
          <span className="relative flex items-center">
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              placeholder="4–8 digit"
              inputMode="numeric"
              autoComplete="new-password"
              className={cn(INPUT, 'pr-11')}
            />
            <button
              type="button"
              onClick={() => setReveal((value) => !value)}
              aria-label={reveal ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
              className="absolute right-3.5 text-ink-faint transition hover:text-ink-soft"
            >
              {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          </span>
          <span className="text-note text-ink-faint">Hanya angka, 4–8 digit.</span>
        </label>

        {error ? (
          <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{error}</p>
        ) : null}

        <div className="flex items-start gap-[7px] rounded-[9px] bg-bg px-[11px] py-[9px]">
          <Info className="mt-px size-3 shrink-0 text-ink-faint" aria-hidden />
          <p className="text-[10.5px] text-ink-soft">
            QR muncul di tab Koneksi setelah sesi dibuat.
          </p>
        </div>
      </div>
    </Modal>
  )
}
