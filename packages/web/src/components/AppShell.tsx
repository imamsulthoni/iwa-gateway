import { Link, useNavigate } from '@tanstack/react-router'
import {
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircle,
  MessageSquare,
  Settings,
  Smartphone,
  Webhook,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '../design-system'
import { api } from '../lib/api'
import { clearApiKey } from '../lib/auth'
import { usePolling } from '../lib/format'
import type { HealthDto, SessionListDto } from '../lib/types'

const GROUPS = [
  {
    label: 'OPERATE',
    items: [
      { to: '/overview', label: 'Ringkasan', icon: LayoutDashboard },
      { to: '/inbox', label: 'Inbox', icon: MessageSquare },
      { to: '/numbers', label: 'Nomor', icon: Smartphone },
      { to: '/history', label: 'Riwayat', icon: History },
    ],
  },
  {
    label: 'SISTEM',
    items: [
      { to: '/webhooks', label: 'Webhook', icon: Webhook },
      { to: '/settings', label: 'Pengaturan', icon: Settings },
    ],
  },
] as const

function sidebarItem(active: boolean): string {
  return cn(
    'flex h-[38px] items-center gap-2.5 rounded-[9px] px-2.5 text-[13.5px] font-medium transition',
    active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const health = usePolling<HealthDto>(() => api.get<HealthDto>('/'), 20_000, true)
  const sessions = usePolling<SessionListDto>(
    () => api.get<SessionListDto>('/sessions'),
    20_000,
    true,
  )

  const total = sessions.data?.items.length ?? 0
  const connected = sessions.data?.items.filter((item) => item.status === 'connected').length ?? 0
  const healthy = health.data?.status === 'ok'

  function logout() {
    clearApiKey()
    void navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen bg-bg font-body text-ink">
      <aside className="sticky top-0 flex h-screen w-[248px] shrink-0 flex-col px-5 pt-7 pb-6">
        <Link to="/overview" className="flex items-center gap-2.5 pb-4">
          <span className="flex size-[30px] items-center justify-center rounded-lg bg-ink">
            <MessageCircle className="size-4 text-white" aria-hidden />
          </span>
          <span className="flex flex-col gap-px">
            <span className="font-data text-[11px] leading-none font-bold tracking-[1.4px] text-ink">
              WA PLATFORM
            </span>
            <span className="font-data text-[9.5px] leading-none tracking-[0.4px] text-ink-faint">
              admin console
            </span>
          </span>
        </Link>
        <div className="h-px w-full bg-line" />

        <div className="mt-[22px] flex flex-col gap-[22px]">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="font-data text-[9.5px] tracking-[1.6px] text-ink-faint uppercase">
                {group.label}
              </p>
              <div className="mt-2 flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={sidebarItem(false)}
                    activeProps={{ className: sidebarItem(true) }}
                  >
                    <item.icon className="size-4" aria-hidden />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <div className="rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center gap-[7px]">
            <span
              className={cn(
                'size-1.5 shrink-0 rounded-pill',
                health.error ? 'bg-red' : healthy ? 'bg-green' : 'bg-amber',
              )}
            />
            <span className="flex-1 font-data text-[9.5px] tracking-[0.8px] text-ink-faint uppercase">
              Service
            </span>
            <span
              className={cn(
                'font-data text-[9.5px] font-semibold tracking-[0.8px] uppercase',
                health.error ? 'text-red' : healthy ? 'text-green' : 'text-amber',
              )}
            >
              {health.error
                ? 'Gangguan'
                : health.data?.status === 'degraded'
                  ? 'Degraded'
                  : healthy
                    ? 'Aktif'
                    : 'Menunggu'}
            </span>
          </div>
          <p className="mt-2 font-data text-note leading-[1.5] text-ink-soft">
            {health.data?.version ?? 'v—'} · {connected} / {total} nomor terhubung
          </p>
        </div>

        <div className="mt-4 flex items-start gap-[7px]">
          <Lock className="mt-px size-3 shrink-0 text-ink-faint" aria-hidden />
          <p className="text-[10.5px] leading-[1.55] text-ink-faint">
            Data pelanggan tidak disimpan di service ini.
          </p>
        </div>

        <div className="mt-[18px] flex items-center gap-[9px]">
          <span className="flex size-7 items-center justify-center rounded-pill border border-line bg-surface-soft font-data text-[9.5px] font-semibold text-ink-soft">
            AD
          </span>
          <span className="flex flex-1 flex-col gap-px">
            <span className="text-body font-medium text-ink">Admin</span>
            <span className="font-data text-[9.5px] text-ink-faint">api key</span>
          </span>
          <button
            type="button"
            onClick={logout}
            aria-label="Keluar"
            className="text-ink-faint transition hover:text-ink"
          >
            <LogOut className="size-3.5" />
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-10 pt-6 pb-7">{children}</main>
    </div>
  )
}
