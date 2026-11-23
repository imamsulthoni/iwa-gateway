import type { ConsumerEndpoint, ConsumerEndpointMethod } from '@wbc/shared'
import { CONSUMER_ENDPOINTS } from '@wbc/shared'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, BookOpen, GraphStar } from 'lucide-react'
import type { ReactNode } from 'react'

import { CodeBlock } from '../components/code-block'
import type { BadgeTone } from '../design-system'
import { Badge, Card, Chip } from '../design-system'
import {
  API_GROUPS,
  AUTH_GUIDE,
  CONVENTIONS,
  FLOW_STEPS,
  NOT_FOR_CONSUMERS,
  WEBHOOK_DELIVERY,
  WEBHOOK_EVENTS,
  buildCodeSamples,
  endpointResponse,
} from '../lib/api-guide'
import { getEnv } from '../lib/env'

export const Route = createFileRoute('/docs')({
  component: DocsPage,
})

const NAV = [
  { id: 'auth', label: 'Autentikasi' },
  { id: 'conventions', label: 'Konvensi' },
  { id: 'flow', label: 'Alur follow-up' },
  { id: 'catalog', label: 'Katalog endpoint' },
  { id: 'webhook', label: 'Webhook' },
  { id: 'boundaries', label: 'Batas consumer' },
] as const

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function endpointAnchor(endpoint: ConsumerEndpoint): string {
  return `ep-${slug(`${endpoint.method} ${endpoint.path}`)}`
}

const CATALOG_NAV = API_GROUPS.map((group) => ({
  id: `group-${group.id}`,
  label: group.label,
  endpoints: CONSUMER_ENDPOINTS.filter((endpoint) => endpoint.group === group.id).map(
    (endpoint) => ({
      id: endpointAnchor(endpoint),
      method: endpoint.method,
      path: endpoint.path,
    }),
  ),
})).filter((group) => group.endpoints.length > 0)

const METHOD_TONES: Record<ConsumerEndpointMethod, BadgeTone> = {
  GET: 'info',
  POST: 'success',
  PATCH: 'warning',
  DELETE: 'danger',
}

const PRIMARY_LINK =
  'inline-flex h-9 items-center gap-1.5 rounded-pill bg-ink px-4 text-small font-medium text-white transition hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink/15 focus-visible:outline-none'
const SECONDARY_LINK =
  'inline-flex h-9 items-center gap-1.5 rounded-pill border border-line bg-surface px-4 text-small font-medium text-ink transition hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-ink/15 focus-visible:outline-none'

function DocsPage() {
  const { apiBaseUrl } = getEnv()

  return (
    <div className="min-h-screen bg-bg font-body text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link to="/docs" className="flex shrink-0 items-center gap-2.5">
            <span className="flex size-[30px] items-center justify-center rounded-lg bg-ink">
              <GraphStar className="size-4 text-white" aria-hidden />
            </span>
            <span className="flex flex-col gap-px">
              <span className="font-data text-[11px] leading-none font-bold tracking-[1.4px] whitespace-nowrap text-ink">
                WA BOT CONSOLE
              </span>
              <span className="font-data text-[9.5px] leading-none tracking-[0.4px] whitespace-nowrap text-ink-faint">
                panduan integrasi
              </span>
            </span>
          </Link>
          <nav className="ml-auto flex shrink-0 items-center gap-2">
            <div className="hidden sm:block">
              <a
                href={`${apiBaseUrl}/docs`}
                target="_blank"
                rel="noreferrer"
                className={SECONDARY_LINK}
              >
                Referensi lengkap
                <ArrowUpRight className="size-3" aria-hidden />
              </a>
            </div>
            <Link to="/login" className={PRIMARY_LINK}>
              Buka console
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1180px] gap-10 px-6 py-10">
        <aside className="hidden w-[190px] shrink-0 lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-8rem)] space-y-0.5 overflow-y-auto pb-4">
            <p className="mb-2 font-data text-label tracking-[1.6px] text-ink-faint uppercase">
              Daftar isi
            </p>
            {NAV.map((item) => (
              <div key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="block rounded-control px-2.5 py-1.5 text-small font-medium text-ink-soft transition hover:bg-surface-soft hover:text-ink"
                >
                  {item.label}
                </a>
                {item.id === 'catalog' ? <CatalogNav /> : null}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-14">
          <div className="space-y-4">
            <p className="font-data text-label tracking-[1.6px] text-ink-faint uppercase">
              Katalog API consumer
            </p>
            <h1 className="text-display text-ink">Panduan Integrasi API</h1>
            <p className="max-w-[70ch] text-body text-ink-soft">
              Endpoint terkurasi yang boleh dipakai aplikasi lain seperti remarketing dan follow-up.
              Referensi skema lengkap tetap ada di Scalar.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-data text-label tracking-[1.2px] text-ink-faint uppercase">
                Base URL
              </span>
              <code className="rounded-chip bg-surface px-2 py-1 font-data text-value text-ink">
                {apiBaseUrl}
              </code>
            </div>
            <nav className="flex flex-wrap gap-1.5 lg:hidden">
              {NAV.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="rounded-pill border border-line bg-surface px-2.5 py-1 text-small font-medium text-ink-soft"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>

          <Section
            id="auth"
            eyebrow="01 / Autentikasi"
            title="Satu header untuk semua endpoint"
            description={AUTH_GUIDE.detail}
          >
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
              <CodeBlock samples={AUTH_GUIDE.samples} />
              <Card className="space-y-2">
                <p className="font-data text-label tracking-[1.2px] text-ink-faint uppercase">
                  Buat key baru
                </p>
                <code className="block overflow-x-auto rounded-chip bg-surface-soft px-2 py-1.5 font-data text-value text-ink">
                  {AUTH_GUIDE.createKeyCommand}
                </code>
                <p className="text-small leading-[1.6] text-ink-soft">
                  Simpan key di server aplikasi consumer. Jangan menaruhnya di kode frontend,
                  repositori, atau bundle browser.
                </p>
              </Card>
            </div>
          </Section>

          <Section
            id="conventions"
            eyebrow="02 / Konvensi"
            title="Aturan yang berlaku di semua endpoint"
            description="Bentuk error, pagination, format nomor, waktu, dan rate limit konsisten di seluruh API."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {CONVENTIONS.map((block) => (
                <Card key={block.title} className="space-y-2.5">
                  <p className="text-body font-semibold text-ink">{block.title}</p>
                  <p className="text-small leading-[1.6] text-ink-soft">{block.detail}</p>
                  {block.samples ? <CodeBlock samples={block.samples} /> : null}
                </Card>
              ))}
            </div>
          </Section>

          <Section
            id="flow"
            eyebrow="03 / Alur"
            title="Follow-up remarketing dalam 4 langkah"
            description="Pola yang sama dipakai untuk campaign follow-up: pilih nomor, kirim pesan, tunggu balasan, lalu baca konteks percakapan."
          >
            <ol className="space-y-3">
              {FLOW_STEPS.map((step, index) => (
                <li key={step.title}>
                  <Card className="flex gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-line bg-surface-soft font-data text-label font-semibold text-ink-soft">
                      {index + 1}
                    </span>
                    <div className="space-y-1">
                      <p className="text-body font-semibold text-ink">{step.title}</p>
                      <p className="text-small leading-[1.6] text-ink-soft">{step.detail}</p>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          </Section>

          <Section
            id="catalog"
            eyebrow="04 / Katalog"
            title={`${CONSUMER_ENDPOINTS.length} endpoint untuk consumer`}
            description="Setiap entri di bawah cocok dengan dokumen OpenAPI dan dijaga test anti-drift di backend."
          >
            <div className="space-y-8">
              {API_GROUPS.map((group) => {
                const endpoints = CONSUMER_ENDPOINTS.filter(
                  (endpoint) => endpoint.group === group.id,
                )
                if (endpoints.length === 0) return null
                return (
                  <div key={group.id} id={`group-${group.id}`} className="scroll-mt-24 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-body font-semibold text-ink">{group.label}</h3>
                      <p className="text-small text-ink-faint">{group.note}</p>
                    </div>
                    <div className="space-y-3">
                      {endpoints.map((endpoint) => (
                        <EndpointCard
                          key={`${endpoint.method} ${endpoint.path}`}
                          id={endpointAnchor(endpoint)}
                          endpoint={endpoint}
                          apiBaseUrl={apiBaseUrl}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section
            id="webhook"
            eyebrow="05 / Webhook"
            title="Terima event tanpa polling"
            description="Daftarkan URL lewat POST /v1/webhooks. Secret hanya tampil sekali saat pembuatan atau rotasi."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {WEBHOOK_EVENTS.map((event) => (
                <Card key={event.title} className="space-y-2.5">
                  <div>
                    <p className="text-body font-semibold text-ink">{event.title}</p>
                    <p className="text-small text-ink-soft">{event.detail}</p>
                  </div>
                  {event.samples ? <CodeBlock samples={event.samples} /> : null}
                </Card>
              ))}
            </div>

            <Card className="space-y-3">
              <p className="text-body font-semibold text-ink">{WEBHOOK_DELIVERY.title}</p>
              <ul className="space-y-1.5">
                {WEBHOOK_DELIVERY.points.map((point) => (
                  <li key={point} className="flex gap-2 text-small leading-[1.6] text-ink-soft">
                    <span className="mt-[7px] size-1 shrink-0 rounded-pill bg-ink-faint" />
                    {point}
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5">
                <p className="font-data text-label tracking-[1.2px] text-ink-faint uppercase">
                  Verifikasi signature
                </p>
                <CodeBlock
                  samples={[
                    { id: 'fetch', label: 'TypeScript', code: WEBHOOK_DELIVERY.verifySample },
                  ]}
                />
              </div>
            </Card>
          </Section>

          <Section
            id="boundaries"
            eyebrow="06 / Batas"
            title="Endpoint yang bukan untuk consumer"
            description="Daftar ini hanya penegasan: endpoint dashboard internal tidak dipakai aplikasi lain."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {NOT_FOR_CONSUMERS.map((group) => (
                <Card key={group.label} className="space-y-2.5">
                  <p className="font-data text-label tracking-[1.2px] text-ink-faint uppercase">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <Chip key={item} className="font-data">
                        {item}
                      </Chip>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </Section>

          <footer className="border-t border-line pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-small text-ink-soft">
                <BookOpen className="size-3.5 text-ink-faint" aria-hidden />
                Butuh skema request dan response lengkap?
              </p>
              <a
                href={`${apiBaseUrl}/docs`}
                target="_blank"
                rel="noreferrer"
                className={PRIMARY_LINK}
              >
                Buka Scalar
                <ArrowUpRight className="size-3" aria-hidden />
              </a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

type SectionProps = {
  id: string
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}

function CatalogNav() {
  return (
    <div className="mt-1 mb-2 space-y-3 border-l border-line pl-2.5">
      {CATALOG_NAV.map((group) => (
        <div key={group.id} className="space-y-0.5">
          <a
            href={`#${group.id}`}
            className="block rounded-control px-1.5 py-1 text-small font-medium text-ink-soft transition hover:bg-surface-soft hover:text-ink"
          >
            {group.label}
          </a>
          <div className="space-y-px">
            {group.endpoints.map((endpoint) => (
              <a
                key={endpoint.id}
                href={`#${endpoint.id}`}
                className="flex items-center gap-1.5 rounded-control px-1.5 py-1 font-data text-[10px] leading-tight text-ink-faint transition hover:bg-surface-soft hover:text-ink"
              >
                <span className="w-8 shrink-0 tracking-[0.04em]">{endpoint.method}</span>
                <span className="truncate">{endpoint.path}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ id, eyebrow, title, description, children }: SectionProps) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="space-y-1.5">
        <p className="font-data text-label tracking-[1.6px] text-ink-faint uppercase">{eyebrow}</p>
        <h2 className="text-title text-ink">{title}</h2>
        <p className="max-w-[70ch] text-body text-ink-soft">{description}</p>
      </div>
      {children}
    </section>
  )
}

type EndpointCardProps = {
  endpoint: ConsumerEndpoint
  apiBaseUrl: string
  id: string
}

function EndpointCard({ endpoint, apiBaseUrl, id }: EndpointCardProps) {
  const response = endpointResponse(endpoint)

  return (
    <Card id={id} className="scroll-mt-24 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={METHOD_TONES[endpoint.method]} dot={false}>
          {endpoint.method}
        </Badge>
        <code className="min-w-0 font-data text-[12px] break-all text-ink">{endpoint.path}</code>
        <span className="ml-auto rounded-chip bg-surface-soft px-2 py-[3px] font-data text-label tracking-[0.08em] text-ink-faint uppercase">
          {endpoint.auth}
        </span>
      </div>
      <div className="space-y-0.5">
        <p className="text-body font-medium text-ink">{endpoint.summary}</p>
        <p className="text-small leading-[1.6] text-ink-soft">{endpoint.detail}</p>
      </div>
      <CodeBlock samples={buildCodeSamples(endpoint, apiBaseUrl)} />
      {response ? (
        <div className="space-y-1.5">
          <p className="font-data text-label tracking-[1.2px] text-ink-faint uppercase">
            Contoh response
          </p>
          <CodeBlock samples={[response]} />
        </div>
      ) : null}
      <a
        href={`${apiBaseUrl}/docs`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-small font-medium text-ink underline underline-offset-2 transition hover:text-ink-soft"
      >
        Skema lengkap di Scalar
        <ArrowUpRight className="size-3" aria-hidden />
      </a>
    </Card>
  )
}
