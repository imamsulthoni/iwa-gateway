import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, MessageCircle } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'

import { Button, cn } from '../design-system'
import { verifyApiKey } from '../lib/api'
import { getApiKey, setApiKey } from '../lib/auth'

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    if (getApiKey()) throw redirect({ to: '/overview' })
  },
  component: LoginPage,
})

const TERMINAL_ROWS = [
  { key: 'service', value: 'wa-gateway  ·  v1.4.2', accent: true },
  { key: 'sessions', value: '3 terhubung  /  5 total', accent: false },
  { key: 'broadcast', value: '142 terkirim  ·  3 gagal', accent: false },
  { key: 'uptime', value: '99,98%  ·  12 hari', accent: true },
] as const

function LoginPage() {
  const navigate = useNavigate()
  const [apiKey, setApiKeyValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const valid = await verifyApiKey(apiKey.trim())
      if (!valid) {
        setError('API key tidak valid atau sudah dicabut')
        return
      }
      setApiKey(apiKey.trim())
      await navigate({ to: '/overview' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memverifikasi API key')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-[55%] shrink-0 flex-col bg-inverse px-14 pt-13 pb-11 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[30px] items-center justify-center rounded-lg bg-white">
            <MessageCircle className="size-4 text-ink" aria-hidden />
          </span>
          <span className="flex flex-col gap-px">
            <span className="font-data text-[11px] leading-none font-bold tracking-[1.4px] text-white">
              WA PLATFORM
            </span>
            <span className="font-data text-[9.5px] leading-none tracking-[0.4px] text-inverse-muted">
              admin console
            </span>
          </span>
        </div>

        <div className="flex-1" />

        <p className="font-data text-[9.5px] tracking-[2px] text-inverse-muted uppercase">
          OPS CONSOLE / WHATSAPP
        </p>
        <div className="mt-3.5 h-[3px] w-14 rounded-pill bg-linear-to-r from-accent-lime to-accent-green" />
        <h2 className="mt-6 max-w-[460px] text-[46px] leading-[1.08] font-medium tracking-[-1.8px] text-white">
          Kendali penuh atas setiap pesan.
        </h2>
        <p className="mt-[18px] max-w-[460px] text-[13.5px] leading-[1.6] text-inverse-soft">
          Kelola sesi WhatsApp, kirim pesan, dan jalankan broadcast dari satu console yang tenang.
        </p>

        <div className="mt-9 max-w-[460px] rounded-xl border border-inverse-line bg-inverse-surface px-[18px] py-4 font-data text-[11px]">
          {TERMINAL_ROWS.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-[5px]">
              <span className="flex items-center gap-2">
                <span className="text-inverse-faint">›</span>
                <span className="text-inverse-strong">{row.key}</span>
              </span>
              <span className={row.accent ? 'text-inverse-accent' : 'text-inverse-text'}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex items-center justify-between">
          <p className="font-data text-label tracking-[0.8px] text-inverse-faint">
            WA PLATFORM · v1.4.2
          </p>
          <p className="font-data text-label text-inverse-faint">data pelanggan tidak disimpan</p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10 lg:px-[72px]">
        <div className="w-full max-w-[420px]">
          <p className="font-data text-[9.5px] tracking-[1.8px] text-ink-faint uppercase">
            ADMIN ACCESS
          </p>
          <h1 className="mt-3.5 text-[31px] font-semibold tracking-[-1.1px] text-ink">
            Masuk ke console
          </h1>
          <p className="mt-2 text-body text-ink-soft">
            Tempelkan API key admin untuk mengakses sesi, pesan, dan broadcast.
          </p>

          <form className="mt-7" onSubmit={(event) => void submit(event)}>
            <label
              htmlFor="api-key"
              className="font-data text-label tracking-[1.2px] text-ink-soft uppercase"
            >
              API KEY
            </label>
            <div
              className={cn(
                'mt-2 flex h-[52px] items-center gap-2.5 rounded-field border bg-bg px-3.5 transition',
                error ? 'border-red' : 'border-line-strong focus-within:border-ink',
              )}
            >
              <KeyRound className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
              <input
                id="api-key"
                type={reveal ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKeyValue(event.target.value)}
                placeholder="x-api-key"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent font-data text-[12px] text-ink outline-none placeholder:text-ink-faint"
              />
              <button
                type="button"
                onClick={() => setReveal((value) => !value)}
                aria-label={reveal ? 'Sembunyikan API key' : 'Tampilkan API key'}
                className="text-ink-faint transition hover:text-ink-soft"
              >
                {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
            {error ? <p className="mt-2 text-help text-red">{error}</p> : null}

            <Button type="submit" size="lg" className="mt-[34px] w-full" disabled={busy || !apiKey}>
              Masuk ke dashboard
              <ArrowRight className="size-3.5" aria-hidden />
            </Button>
          </form>

          <p className="mt-3.5 flex items-start gap-[7px] text-[10.5px] leading-[1.5] text-ink-faint">
            <Lock className="mt-px size-[11px] shrink-0" aria-hidden />
            Key disimpan di sessionStorage dan hilang saat tab ditutup.
          </p>

          <div className="mt-9 h-px w-full bg-line" />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-faint">Belum punya API key?</p>
            <p className="text-[11px] font-medium text-ink">Hubungi admin layanan ↗</p>
          </div>
        </div>
      </main>
    </div>
  )
}
