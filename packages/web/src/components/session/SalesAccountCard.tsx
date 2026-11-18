import { Eye, EyeOff, KeyRound, UserPlus } from 'lucide-react'
import { useState } from 'react'

import { Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import type { SessionDto } from '../../lib/types'
import { Modal } from '../dialogs'
import { CardLabel, FIELD_INPUT, FieldLabel, Panel } from './parts'

type SalesAccountCardProps = {
  session: SessionDto
  onChanged: () => void
}

export function SalesAccountCard({ session, onChanged }: SalesAccountCardProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const attach = session.salesName === null
  const canSubmit = /^\d{4,8}$/.test(pin) && (!attach || name.trim().length > 0)

  function close() {
    setOpen(false)
    setName('')
    setPin('')
    setReveal(false)
    setError(null)
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (attach) {
        await api.patch(`/sessions/${session.id}/sales`, { salesName: name.trim(), pin })
      } else {
        await api.post(`/sessions/${session.id}/sales/pin`, { pin })
      }
      setNotice(
        attach
          ? 'Akun sales tertaut. Sales bisa login dengan nomor sesi ini.'
          : 'PIN diperbarui. Token login lama dicabut.',
      )
      close()
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aksi gagal')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="gap-0 p-5">
      <div className="flex items-center justify-between gap-3">
        <CardLabel>{attach ? 'Akun sales' : `Sales · ${session.salesName}`}</CardLabel>
        <KeyRound className="size-[13px] text-ink-faint" aria-hidden />
      </div>
      <div className="h-2.5" />
      <p className="text-[10.5px] leading-[1.45] text-ink-soft">
        {attach
          ? 'Sesi ini belum punya akun sales. Tautkan nama dan PIN agar bisa login tanpa pairing ulang.'
          : 'Sales lupa PIN? Reset di sini; semua token login lama langsung dicabut.'}
      </p>
      <div className="h-3" />
      <Button
        variant="secondary"
        size="sm"
        className="h-[30px] self-start px-3 text-[11.5px]"
        onClick={() => {
          setNotice(null)
          setOpen(true)
        }}
      >
        {attach ? (
          <UserPlus className="size-3 text-ink-soft" aria-hidden />
        ) : (
          <KeyRound className="size-3 text-ink-soft" aria-hidden />
        )}
        {attach ? 'Tautkan sales' : 'Reset PIN'}
      </Button>
      {notice ? <p className="pt-2.5 text-note text-green">{notice}</p> : null}

      <Modal
        open={open}
        title={attach ? 'Tautkan akun sales' : 'Reset PIN sales'}
        description={
          attach
            ? `Akun memakai nomor ${session.phoneNumber ?? '—'}. Satu nomor hanya untuk satu sales.`
            : `PIN baru untuk ${session.salesName}. Token login lama akan dicabut.`
        }
        onClose={close}
        footer={
          <>
            <span />
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={close} disabled={busy}>
                Batal
              </Button>
              <Button onClick={() => void submit()} disabled={!canSubmit || busy}>
                {busy ? 'Menyimpan...' : attach ? 'Tautkan' : 'Simpan PIN'}
              </Button>
            </div>
          </>
        }
      >
        <div className="flex flex-col gap-3.5">
          {attach ? (
            <label className="flex flex-col gap-1.5">
              <FieldLabel>Nama sales</FieldLabel>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="mis. Rani"
                className={FIELD_INPUT}
                autoFocus
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <FieldLabel>PIN baru</FieldLabel>
            <span className="relative flex items-center">
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                placeholder="4–8 digit"
                inputMode="numeric"
                autoComplete="new-password"
                type={reveal ? 'text' : 'password'}
                className={cn(FIELD_INPUT, 'pr-11')}
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
        </div>
      </Modal>
    </Panel>
  )
}