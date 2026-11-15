import { CheckCheck, Send } from 'lucide-react'
import { useState } from 'react'

import { Badge, Button } from '../../design-system'
import { demoSendMessage } from '../../lib/demo'
import { formatDateTime, formatPhone } from '../../lib/format'
import type { SendMessageResponseDto, SessionDto } from '../../lib/types'
import { CardLabel, NoteRow, Panel, TextField, TextareaField } from './parts'

type KirimTabProps = {
  session: SessionDto
}

export function KirimTab({ session }: KirimTabProps) {
  const [to, setTo] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [text, setText] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [result, setResult] = useState<SendMessageResponseDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const ready = to.replace(/\D/g, '').length >= 8 && text.trim().length > 0

  async function submit() {
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      const response = demoSendMessage(session.id, {
        to: to.replace(/\D/g, ''),
        referenceId: referenceId.trim() || `web-${Date.now()}`,
        text,
        customerId: customerId.trim() || undefined,
        customerName: customerName.trim() || undefined,
      })
      setResult(response)
      setText('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengirim pesan')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex w-[720px] max-w-full flex-col gap-4">
        <Panel className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
                Kirim satu pesan
              </h2>
              <p className="text-small text-ink-faint">
                Pesan hanya dikirim ke satu nomor, tanpa antrean broadcast.
              </p>
            </div>
            <span className="rounded-pill bg-surface-soft px-[9px] py-1 font-data text-[8.5px] tracking-[0.8px] text-ink-soft">
              1 : 1
            </span>
          </div>

          <div className="h-5" />

          {error ? (
            <p className="mb-4 rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{error}</p>
          ) : null}

          <div className="flex flex-wrap gap-3.5">
            <TextField
              label="Nomor tujuan"
              hint="Format internasional tanpa tanda +."
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="6281233448890"
              inputMode="numeric"
              className="min-w-[220px] flex-1"
            />
            <TextField
              label="Reference ID"
              hint="Idempotensi: kiriman ulang tidak menduplikasi."
              value={referenceId}
              onChange={(event) => setReferenceId(event.target.value)}
              placeholder="msg_8841"
              className="min-w-[220px] flex-1"
            />
          </div>

          <div className="h-4" />

          <TextareaField
            label="Pesan"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={'Halo Hendra, promo Ramadan batch 2 sudah dimulai.\nBalas YA untuk ikut, atau STOP untuk berhenti.'}
            className="h-[148px]"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-note text-ink-faint">Teks polos · tanpa lampiran</p>
            <p className="font-data text-[9px] text-ink-faint">{text.length} / 4096</p>
          </div>

          <div className="my-4 h-px w-full bg-line" />

          <div className="flex items-center justify-between gap-3">
            <CardLabel>Data pelanggan</CardLabel>
            <span className="font-data text-[9px] text-ink-faint">opsional</span>
          </div>
          <div className="h-2.5" />
          <div className="flex flex-wrap gap-3.5">
            <TextField
              label="Customer ID"
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
              placeholder="cust_2291"
              className="min-w-[200px] flex-1"
            />
            <TextField
              label="Customer Name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Hendra"
              className="min-w-[200px] flex-1"
            />
          </div>

          <div className="h-5" />
          <div className="flex items-center justify-between gap-4">
            <Button
              className="h-[38px] px-[18px] text-[12.5px]"
              disabled={busy || !ready}
              onClick={() => void submit()}
            >
              <Send className="size-[13px]" aria-hidden />
              {busy ? 'Mengirim...' : 'Kirim pesan'}
            </Button>
            <p className="font-data text-[9px] text-ink-faint">
              tanpa delay · langsung dikirim
            </p>
          </div>
        </Panel>
      </div>

      <div className="flex min-w-[320px] flex-1 flex-col gap-4">
        <Panel className="gap-[7px] p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <CardLabel>Koneksi</CardLabel>
            <span className="inline-flex items-center gap-[5px] font-data text-[8.5px] tracking-[0.6px] text-green uppercase">
              <span className="size-[5px] rounded-pill bg-green" />
              {session.status === 'connected' ? 'Terhubung' : session.status}
            </span>
          </div>
          <p className="font-data text-[13px] text-ink">{formatPhone(session.phoneNumber)}</p>
          <p className="text-note text-ink-faint">
            {session.publicId} · {session.status === 'connected' ? 'siap menerima perintah' : 'belum siap'}
          </p>
        </Panel>

        <Panel className="gap-0 p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <CardLabel>Pengiriman terakhir</CardLabel>
            {result ? <Badge tone={tone(result.message.status)}>{result.message.status}</Badge> : null}
          </div>
          <div className="h-3.5" />
          {result ? (
            <>
              <p className="text-small leading-[1.45] text-ink">{result.message.body ?? '—'}</p>
              <div className="h-3" />
              <Summary label="Ke" value={formatPhone(result.message.to)} />
              <Summary label="Reference" value={result.message.referenceId ?? '—'} />
              <Summary label="Waktu" value={formatDateTime(result.message.createdAt)} />
              <div className="h-2.5" />
              <p className="text-[10.5px] text-ink-faint">
                {result.duplicate ? 'Pesan duplikat, tidak dikirim ulang.' : 'Masuk antrean pengiriman.'}
              </p>
            </>
          ) : (
            <p className="text-small text-ink-faint">Belum ada pengiriman di tab ini.</p>
          )}
        </Panel>

        <Panel className="gap-2.5 p-[18px]">
          <CardLabel>Catatan</CardLabel>
          <NoteRow>Satu permintaan hanya membuat satu pesan.</NoteRow>
          <NoteRow>referenceId mencegah pengiriman ganda.</NoteRow>
          <NoteRow>Balasan pelanggan tidak dicatat service.</NoteRow>
        </Panel>

        <Panel className="gap-0 p-[18px]">
          <div className="flex items-center justify-between gap-3">
            <CardLabel>Pratinjau</CardLabel>
            <p className="font-data text-[8.5px] text-ink-faint">{to || '—'}</p>
          </div>
          <div className="h-3" />
          <div className="flex flex-col gap-2 rounded-xl bg-green-soft px-3 py-2.5">
            <p className="text-[11px] leading-[1.5] text-ink">
              {text || 'Teks pesan akan tampil di sini.'}
            </p>
            <div className="flex items-center justify-end gap-1">
              <span className="font-data text-[8px] text-ink-soft">12:04</span>
              <CheckCheck className="size-[11px] text-green" aria-hidden />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <p className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</p>
      <p className="truncate font-data text-[10px] text-ink-soft">{value}</p>
    </div>
  )
}

function tone(status: string) {
  if (status === 'failed') return 'danger' as const
  if (status === 'queued') return 'neutral' as const
  return 'success' as const
}