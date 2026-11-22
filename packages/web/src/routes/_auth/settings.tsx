import {
  DEFAULT_MAX_DELAY_SECONDS,
  DEFAULT_MIN_DELAY_SECONDS,
  MAX_DELAY_SECONDS,
  MIN_DELAY_SECONDS,
  isValidDelayRange,
} from '@wbc/shared'
import { createFileRoute, redirect } from '@tanstack/react-router'
import {
  CircleCheck,
  DatabaseZap,
  EyeOff,
  Inbox,
  Info,
  KeyRound,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'

import { Badge, Button, cn } from '../../design-system'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { getEnv } from '../../lib/env'
import { formatDateTime, usePolling } from '../../lib/format'
import type { HealthDto, SettingsDto } from '../../lib/types'

export const Route = createFileRoute('/_auth/settings')({
  beforeLoad: () => {
    if (!isAdmin()) throw redirect({ to: '/numbers' })
  },
  component: SettingsPage,
})

const PRIVACY = [
  {
    icon: DatabaseZap,
    title: 'Tanpa penyimpanan',
    description: 'Data pelanggan tidak disimpan di service ini.',
  },
  {
    icon: Inbox,
    title: 'Hanya pesan keluar',
    description: 'Pesan masuk tidak dicatat sama sekali.',
  },
  {
    icon: KeyRound,
    title: 'API key per-tab',
    description: 'Disimpan di sessionStorage dan hilang saat tab ditutup.',
  },
  {
    icon: EyeOff,
    title: 'Token sekali tampil',
    description: 'Token sesi hanya muncul saat dibuat atau dirotasi.',
  },
]

function SettingsPage() {
  const health = usePolling<HealthDto>(() => api.get<HealthDto>('/v1/health'), 30_000, true)
  const [delay, setDelay] = useState({
    min: DEFAULT_MIN_DELAY_SECONDS,
    max: DEFAULT_MAX_DELAY_SECONDS,
  })
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [updatedAt, setUpdatedAt] = useState(() => new Date())
  const [settings, setSettings] = useState<SettingsDto | null>(null)
  const [maxSales, setMaxSales] = useState('')
  const [salesNotice, setSalesNotice] = useState<{
    tone: 'success' | 'danger'
    text: string
  } | null>(null)
  const [savingSales, setSavingSales] = useState(false)
  const [savingDelay, setSavingDelay] = useState(false)

  useEffect(() => {
    void api
      .get<SettingsDto>('/v1/settings')
      .then((value) => {
        setSettings(value)
        setMaxSales(String(value.maxSales))
        setDelay({ min: value.defaultMinDelay, max: value.defaultMaxDelay })
      })
      .catch((cause: unknown) =>
        setSalesNotice({
          tone: 'danger',
          text: cause instanceof Error ? cause.message : 'Gagal memuat pengaturan',
        }),
      )
  }, [])

  const maxSalesValue = Number(maxSales)
  const maxSalesValid =
    Number.isInteger(maxSalesValue) && maxSalesValue >= 1 && maxSalesValue <= 100

  async function saveSalesLimit() {
    if (!maxSalesValid) return
    setSavingSales(true)
    setSalesNotice(null)
    try {
      const result = await api.patch<SettingsDto>('/v1/settings', { maxSales: maxSalesValue })
      setSettings(result)
      setMaxSales(String(result.maxSales))
      setSalesNotice({ tone: 'success', text: 'Batas jumlah sales tersimpan.' })
    } catch (cause) {
      setSalesNotice({
        tone: 'danger',
        text: cause instanceof Error ? cause.message : 'Gagal menyimpan batas sales',
      })
    } finally {
      setSavingSales(false)
    }
  }

  const info = health.data
  const healthy = info?.status === 'ok'
  let endpoint = '/api · local'
  try {
    endpoint = getEnv().apiBaseUrl
  } catch {
    endpoint = '—'
  }

  async function persistDelay(next: { min: number; max: number }) {
    setSavingDelay(true)
    setNotice(null)
    try {
      const result = await api.patch<SettingsDto>('/v1/settings', {
        defaultMinDelay: next.min,
        defaultMaxDelay: next.max,
      })
      setSettings(result)
      setDelay({ min: result.defaultMinDelay, max: result.defaultMaxDelay })
      setNotice({ tone: 'success', text: 'Default delay tersimpan di server.' })
    } catch (cause) {
      setNotice({
        tone: 'danger',
        text: cause instanceof Error ? cause.message : 'Gagal menyimpan default delay',
      })
    } finally {
      setSavingDelay(false)
    }
  }

  function save() {
    if (!isValidDelayRange(delay.min, delay.max)) {
      setNotice({
        tone: 'danger',
        text: `Delay harus ${MIN_DELAY_SECONDS}–${MAX_DELAY_SECONDS} detik dan nilai maksimum tidak boleh kurang dari minimum.`,
      })
      return
    }
    void persistDelay(delay)
  }

  function reset() {
    const next = { min: DEFAULT_MIN_DELAY_SECONDS, max: DEFAULT_MAX_DELAY_SECONDS }
    setDelay(next)
    void persistDelay(next)
  }

  function refreshInfo() {
    health.refresh()
    setUpdatedAt(new Date())
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <p className="font-data text-[9.5px] tracking-[1.6px] text-ink-faint uppercase">
            SISTEM / SETTINGS
          </p>
          <h1 className="text-heading text-ink">Pengaturan</h1>
          <p className="text-body text-ink-soft">Preferensi dashboard dan informasi layanan.</p>
        </div>
        <p className="font-data text-[9.5px] text-ink-faint">pengaturan disimpan di server</p>
      </div>

      <div className="h-6" />

      <div className="flex flex-wrap gap-4">
        <section className="flex w-[680px] max-w-full flex-col rounded-card border border-line bg-surface p-[26px]">
          <div className="flex justify-between gap-3">
            <div className="flex flex-col gap-[5px]">
              <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
                Default delay broadcast
              </h2>
              <p className="text-small text-ink-faint">
                Jeda acak antar pesan, dipakai sebagai nilai awal form broadcast.
              </p>
            </div>
            <span className="h-fit rounded-pill bg-surface-soft px-[9px] py-1 font-data text-[8.5px] tracking-[0.8px] text-ink-soft">
              SERVER
            </span>
          </div>

          <div className="h-[22px]" />

          <div className="flex gap-3.5">
            <label className="flex flex-1 flex-col gap-[7px]">
              <span className="font-data text-[9px] tracking-[1.1px] text-ink-faint uppercase">
                DELAY MINIMUM
              </span>
              <span className="flex h-12 items-center justify-between rounded-field bg-bg px-3.5">
                <input
                  type="number"
                  min={MIN_DELAY_SECONDS}
                  max={MAX_DELAY_SECONDS}
                  value={delay.min}
                  onChange={(event) =>
                    setDelay((previous) => ({ ...previous, min: Number(event.target.value) }))
                  }
                  className="w-full bg-transparent font-data text-[17px] font-medium text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="font-data text-[9.5px] text-ink-faint">DETIK</span>
              </span>
            </label>

            <label className="flex flex-1 flex-col gap-[7px]">
              <span className="font-data text-[9px] tracking-[1.1px] text-ink-faint uppercase">
                DELAY MAKSIMUM
              </span>
              <span className="flex h-12 items-center justify-between rounded-field bg-bg px-3.5">
                <input
                  type="number"
                  min={MIN_DELAY_SECONDS}
                  max={MAX_DELAY_SECONDS}
                  value={delay.max}
                  onChange={(event) =>
                    setDelay((previous) => ({ ...previous, max: Number(event.target.value) }))
                  }
                  className="w-full bg-transparent font-data text-[17px] font-medium text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <span className="font-data text-[9.5px] text-ink-faint">DETIK</span>
              </span>
            </label>
          </div>

          <div className="h-3" />

          <div className="flex items-center gap-[7px]">
            <Info className="size-3 shrink-0 text-ink-faint" aria-hidden />
            <p className="text-[10.5px] text-ink-soft">
              Rentang {MIN_DELAY_SECONDS}–{MAX_DELAY_SECONDS} detik. Nilai maksimum harus lebih
              besar atau sama dengan minimum.
            </p>
          </div>

          <div className="h-[18px]" />

          {notice ? (
            <div
              className={cn(
                'flex items-center gap-2 rounded-[10px] px-3 py-2.5',
                notice.tone === 'success' ? 'bg-green-soft text-green' : 'bg-red-soft text-red',
              )}
            >
              {notice.tone === 'success' ? (
                <CircleCheck className="size-[13px] shrink-0" aria-hidden />
              ) : (
                <Info className="size-[13px] shrink-0" aria-hidden />
              )}
              <p className="text-small">{notice.text}</p>
            </div>
          ) : null}

          <div className="h-5" />

          <div className="flex items-center gap-2">
            <Button
              className="h-[34px] px-[18px] text-[12.5px]"
              disabled={savingDelay || !isValidDelayRange(delay.min, delay.max)}
              onClick={save}
            >
              {savingDelay ? 'Menyimpan...' : 'Simpan pengaturan'}
            </Button>
            <Button
              variant="secondary"
              className="h-[34px] px-3.5 text-[12px] text-ink-soft"
              disabled={savingDelay}
              onClick={reset}
            >
              Kembalikan default
            </Button>
            <p className="ml-auto font-data text-[9px] text-ink-faint">
              contoh: {delay.min}s → {delay.max}s → {Math.round((delay.min + delay.max) / 2)}s
            </p>
          </div>
        </section>

        <section className="flex min-w-[320px] flex-1 flex-col rounded-card border border-line bg-surface p-[26px]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Info service</h2>
            <Badge tone={healthy ? 'success' : info ? 'warning' : 'neutral'}>
              {healthy ? 'Sehat' : info ? 'Menurun' : 'Menunggu'}
            </Badge>
          </div>

          <div className="h-4" />

          <div className="flex flex-col divide-y divide-line">
            {[
              ['NAMA', info?.name ?? '—'],
              ['VERSI', info?.version ?? '—'],
              ['STATUS', healthy ? 'Sehat' : health.error ? 'Tidak merespons' : '—'],
              ['ENDPOINT', endpoint],
              ['DIPERBARUI', formatDateTime(updatedAt.toISOString())],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-[9px]">
                <p className="font-data text-[9px] tracking-[1px] text-ink-faint uppercase">
                  {label}
                </p>
                <p
                  className={cn(
                    'truncate font-data text-[11px]',
                    label === 'STATUS' && healthy ? 'text-green' : 'text-ink',
                  )}
                >
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="h-3.5" />

          <button
            type="button"
            onClick={refreshInfo}
            className="flex items-center justify-center gap-[7px] rounded-pill border border-line py-[9px] text-[11.5px] font-medium text-ink transition hover:bg-surface-soft"
          >
            <RefreshCw className="size-3 text-ink-soft" aria-hidden />
            Refresh info service
          </button>
        </section>
      </div>

      <div className="h-4" />

      <section className="flex w-[680px] max-w-full flex-col rounded-card border border-line bg-surface p-[26px]">
        <div className="flex justify-between gap-3">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
              Batas jumlah sales
            </h2>
            <p className="text-small text-ink-faint">
              Kuota akun sales yang boleh dibuat admin. Berlaku saat menambah nomor baru.
            </p>
          </div>
          <span className="h-fit rounded-pill bg-surface-soft px-[9px] py-1 font-data text-[8.5px] tracking-[0.8px] text-ink-soft">
            SERVER
          </span>
        </div>

        <div className="h-[22px]" />

        <div className="flex items-end gap-3.5">
          <label className="flex flex-col gap-[7px]">
            <span className="font-data text-[9px] tracking-[1.1px] text-ink-faint uppercase">
              MAKSIMUM SALES
            </span>
            <span className="flex h-12 w-[150px] items-center justify-between rounded-field bg-bg px-3.5">
              <input
                type="number"
                min={1}
                max={100}
                value={maxSales}
                onChange={(event) => setMaxSales(event.target.value)}
                className="w-full bg-transparent font-data text-[17px] font-medium text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="font-data text-[9.5px] text-ink-faint">AKUN</span>
            </span>
          </label>
          <p className="pb-2 font-data text-[11px] text-ink-soft">
            {settings ? `${settings.salesCount} / ${settings.maxSales} akun terpakai` : 'memuat...'}
          </p>
        </div>

        <div className="h-3" />

        <div className="flex items-center gap-[7px]">
          <Info className="size-3 shrink-0 text-ink-faint" aria-hidden />
          <p className="text-[10.5px] text-ink-soft">
            Nilai 1–100. Penambahan nomor ditolak saat kuota penuh.
          </p>
        </div>

        <div className="h-[18px]" />

        {salesNotice ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-[10px] px-3 py-2.5',
              salesNotice.tone === 'success' ? 'bg-green-soft text-green' : 'bg-red-soft text-red',
            )}
          >
            {salesNotice.tone === 'success' ? (
              <CircleCheck className="size-[13px] shrink-0" aria-hidden />
            ) : (
              <Info className="size-[13px] shrink-0" aria-hidden />
            )}
            <p className="text-small">{salesNotice.text}</p>
          </div>
        ) : null}

        <div className="h-5" />

        <Button
          className="h-[34px] self-start px-[18px] text-[12.5px]"
          disabled={savingSales || !maxSalesValid}
          onClick={() => void saveSalesLimit()}
        >
          {savingSales ? 'Menyimpan...' : 'Simpan batas sales'}
        </Button>
      </section>

      <div className="h-4" />

      <section className="flex flex-col rounded-card border border-line bg-surface p-[26px]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-[5px]">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
              Catatan privasi &amp; keamanan
            </h2>
            <p className="text-small text-ink-faint">
              Prinsip yang dipegang service ini sejak awal.
            </p>
          </div>
          <ShieldCheck className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </div>

        <div className="h-5" />

        <div className="flex gap-[22px]">
          {PRIVACY.map((item, index) => (
            <Fragment key={item.title}>
              {index > 0 ? <span className="w-px shrink-0 self-stretch bg-line" /> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-bg">
                  <item.icon className="size-3.5 text-ink-soft" aria-hidden />
                </span>
                <p className="text-[12px] font-semibold text-ink">{item.title}</p>
                <p className="text-[11px] leading-[1.5] text-ink-soft">{item.description}</p>
              </div>
            </Fragment>
          ))}
        </div>
      </section>

      <div className="flex-1" />

      <div className="mt-4 h-px w-full bg-line" />
      <div className="flex items-center justify-between gap-3 pt-[13px]">
        <p className="font-data text-[9px] tracking-[0.8px] text-ink-faint">
          WA BOT CONSOLE · {info?.version ?? 'v—'}
        </p>
        <p className="font-data text-[9px] text-ink-soft">Dokumentasi API ↗</p>
      </div>
    </div>
  )
}
