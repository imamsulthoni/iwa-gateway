import { Send } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge, Button } from '../../design-system'
import { api } from '../../lib/api'
import { getDefaultDelay } from '../../lib/delay'
import { usePolling } from '../../lib/format'
import type {
  BroadcastCurrentDto,
  CreateBroadcastResponseDto,
  SessionDto,
} from '../../lib/types'
import { BroadcastRail, CardLabel, NoteRow, Panel } from './parts'

type BroadcastTabProps = {
  session: SessionDto
  broadcast: BroadcastCurrentDto | null
  onRefresh: () => void
}

type Recipient = { to: string; name?: string }

function parseRecipients(value: string): Recipient[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [to, name] = line.split(',').map((part) => part.trim())
      return { to: to ?? '', name: name || undefined }
    })
    .filter((recipient) => recipient.to.length > 0)
}

export function BroadcastTab({ session, broadcast, onRefresh }: BroadcastTabProps) {
  const defaults = getDefaultDelay()
  const [recipients, setRecipients] = useState('')
  const [text, setText] = useState('')
  const [minDelay, setMinDelay] = useState(defaults.min)
  const [maxDelay, setMaxDelay] = useState(defaults.max)
  const [referenceId, setReferenceId] = useState('')
  const [created, setCreated] = useState<CreateBroadcastResponseDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(() => parseRecipients(recipients), [recipients])
  const duplicates = parsed.length - new Set(parsed.map((item) => item.to)).size
  const average = (Number(minDelay) + Number(maxDelay)) / 2
  const estimateMinutes = Math.max(1, Math.ceil((parsed.length * average) / 60))

  const live = broadcast?.status === 'running' || broadcast?.status === 'pending'
  const current = usePolling<BroadcastCurrentDto>(
    () => api.get<BroadcastCurrentDto>(`/sessions/${session.id}/broadcast/current`),
    3_000,
    live,
  )
  const activeBroadcast = current.data ?? broadcast

  async function start() {
    setBusy(true)
    setError(null)
    try {
      const response = await api.post<CreateBroadcastResponseDto>(
        `/sessions/${session.id}/broadcast`,
        {
          recipients: parsed,
          text,
          minDelay: Number(minDelay),
          maxDelay: Number(maxDelay),
          referenceId: referenceId.trim() || `bc-${Date.now()}`,
        },
      )
      setCreated(response)
      onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memulai broadcast')
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    setCancelError(null)
    try {
      await api.post(`/sessions/${session.id}/broadcast/cancel`)
      current.refresh()
      onRefresh()
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : 'Gagal membatalkan broadcast')
    }
  }

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex w-[720px] max-w-full flex-col gap-4">
        <Panel className="gap-0 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
                Broadcast ke banyak penerima
              </h2>
              <p className="text-small text-ink-faint">
                Satu pesan, banyak penerima, dengan jeda acak antar pengiriman.
              </p>
            </div>
            <span className="rounded-pill bg-surface-soft px-[9px] py-1 font-data text-[8.5px] tracking-[0.8px] text-ink-soft">
              1 : N
            </span>
          </div>

          <div className="h-5" />

          {error ? (
            <p className="mb-4 rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <CardLabel>Penerima</CardLabel>
            <span className="font-data text-[8.5px] text-ink-faint">satu baris: nomor, nama</span>
          </div>
          <div className="h-2" />
          <textarea
            value={recipients}
            onChange={(event) => setRecipients(event.target.value)}
            placeholder={'6281233448890, Hendra\n6281322117788, Maya'}
            className="h-[142px] w-full resize-none rounded-[10px] bg-bg px-[13px] py-3 font-data text-[11px] leading-[1.6] text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-ink/15"
          />
          <div className="flex items-center justify-between gap-3 pt-[7px]">
            <p className="font-data text-[9px] text-ink-soft">
              {parsed.length} penerima terdeteksi
            </p>
            <p className="font-data text-[9px] text-ink-faint">{duplicates} duplikat</p>
          </div>

          <div className="h-3.5" />

          <div className="flex items-center justify-between gap-3">
            <CardLabel>Pesan broadcast</CardLabel>
            <span className="font-data text-[8.5px] text-ink-faint">{text.length} / 4096</span>
          </div>
          <div className="h-2" />
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Halo {nama}, promo Ramadan batch 2 sudah dimulai. Balas YA untuk ikut, atau STOP untuk berhenti."
            className="h-[118px] w-full resize-none rounded-[10px] bg-bg px-[13px] py-3 font-data text-[11px] leading-[1.6] text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-ink/15"
          />

          <div className="h-4" />

          <div className="flex items-center justify-between gap-3">
            <CardLabel>Delay acak</CardLabel>
            <span className="font-data text-[8.5px] text-ink-faint">nilai awal dari Pengaturan</span>
          </div>
          <div className="h-2" />
          <div className="flex flex-wrap gap-3.5">
            <NumberField
              label="Min (detik)"
              value={minDelay}
              onChange={setMinDelay}
              min={10}
              max={600}
            />
            <NumberField
              label="Maks (detik)"
              value={maxDelay}
              onChange={setMaxDelay}
              min={10}
              max={600}
            />
            <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <span className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">
                Reference ID
              </span>
              <input
                value={referenceId}
                onChange={(event) => setReferenceId(event.target.value)}
                placeholder="bc_ramadan_02"
                className="h-[42px] w-full rounded-[9px] bg-bg px-3 font-data text-[12.5px] text-ink outline-none placeholder:text-ink-faint focus:ring-1 focus:ring-ink/15"
              />
            </label>
          </div>

          <div className="h-5" />
          <div className="flex items-center justify-between gap-4">
            <Button
              className="h-[38px] px-[18px] text-[12.5px]"
              disabled={busy || parsed.length === 0 || !text.trim()}
              onClick={() => void start()}
            >
              <Send className="size-[13px]" aria-hidden />
              {busy ? 'Memulai...' : 'Mulai broadcast'}
            </Button>
            <div className="flex flex-col items-end gap-0.5">
              <p className="font-data text-[9.5px] text-ink-soft">
                {parsed.length} pesan · ± {estimateMinutes} mnt
              </p>
              <p className="font-data text-[8.5px] text-ink-faint">
                estimasi delay {minDelay}–{maxDelay}s
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex min-w-[320px] flex-1 flex-col gap-4">
        {cancelError ? (
          <p className="rounded-[9px] bg-red-soft px-3 py-2 text-note text-red">{cancelError}</p>
        ) : null}

        {activeBroadcast?.jobId ? (
          <div key={activeBroadcast.jobId} className="flex flex-col gap-4">
            <BroadcastRail broadcast={activeBroadcast} />
            {activeBroadcast.status === 'running' || activeBroadcast.status === 'pending' ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-[32px] self-start border-line px-3.5 text-[11.5px] text-red hover:bg-red-soft"
                onClick={() => void cancel()}
              >
                Batalkan broadcast
              </Button>
            ) : null}
            <Panel className="gap-0 pt-[18px] pr-[18px] pb-2.5 pl-[18px]">
              <div className="flex items-center justify-between gap-3">
                <CardLabel>Penerima</CardLabel>
                <p className="font-data text-[9px] text-ink-faint">{activeBroadcast.total}</p>
              </div>
              <div className="h-2" />
              {activeBroadcast.recipients.length > 0 ? (
                activeBroadcast.recipients.slice(0, 6).map((recipient, index) => (
                  <div key={recipient.id}>
                    {index > 0 ? <div className="h-px w-full bg-line" /> : null}
                    <div className="flex items-center justify-between gap-3 py-[9px]">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="truncate text-small text-ink">
                          {recipient.name ?? recipient.to}
                        </p>
                        <p className="font-data text-[8.5px] text-ink-faint">{recipient.to}</p>
                      </div>
                      <Badge tone={recipientTone(recipient.status)}>{recipient.status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-2 text-small text-ink-faint">Belum ada penerima.</p>
              )}
            </Panel>
          </div>
        ) : (
          <Panel className="gap-0 p-[18px]">
            <div className="flex items-center justify-between gap-3">
              <CardLabel>Broadcast berjalan</CardLabel>
              <Badge tone="neutral" dot={false}>
                idle
              </Badge>
            </div>
            <div className="h-2" />
            {parsed.slice(0, 5).map((recipient) => (
              <div key={recipient.to} className="flex items-center justify-between gap-3 py-[7px]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="truncate text-small text-ink">{recipient.name ?? recipient.to}</p>
                  <p className="font-data text-[8.5px] text-ink-faint">{recipient.to}</p>
                </div>
                <Badge tone="neutral">pending</Badge>
              </div>
            ))}
            {parsed.length === 0 ? (
              <p className="mt-2 text-small text-ink-faint">Belum ada broadcast berjalan.</p>
            ) : null}
          </Panel>
        )}

        {created ? (
          <p className="font-data text-[9px] break-all text-ink-faint">Job {created.jobId}</p>
        ) : null}

        <Panel className="gap-2.5 p-[18px]">
          <CardLabel>Catatan</CardLabel>
          <NoteRow>Delay diacak antara nilai min dan maks per pesan.</NoteRow>
          <NoteRow>Batas harian per nomor menghentikan sisa penerima.</NoteRow>
          <NoteRow>Broadcast berjalan bisa dibatalkan kapan saja.</NoteRow>
        </Panel>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}) {
  return (
    <label className="flex w-[150px] flex-col gap-1.5">
      <span className="font-data text-[8.5px] tracking-[1px] text-ink-faint uppercase">{label}</span>
      <div className="flex h-[42px] items-center justify-between rounded-[9px] bg-bg px-3">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full bg-transparent font-data text-[12.5px] text-ink outline-none"
        />
        <span className="font-data text-[8.5px] text-ink-faint">s</span>
      </div>
    </label>
  )
}

function recipientTone(status: string) {
  if (status === 'failed') return 'danger' as const
  if (status === 'sent') return 'success' as const
  return 'neutral' as const
}