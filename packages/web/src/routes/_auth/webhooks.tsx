import { WEBHOOK_EVENT_TYPES } from '@wbc/shared'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Field,
  Input,
  PageHeader,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../../design-system'
import { api } from '../../lib/api'
import { isAdmin } from '../../lib/auth'
import { formatDateTime, usePolling } from '../../lib/format'
import type {
  WebhookDeliveryDto,
  WebhookDeliveryListDto,
  WebhookEndpointCreatedDto,
  WebhookEndpointDto,
  WebhookEndpointListDto,
} from '../../lib/types'

export const Route = createFileRoute('/_auth/webhooks')({
  beforeLoad: () => {
    if (!isAdmin()) throw redirect({ to: '/numbers' })
  },
  component: WebhooksPage,
})

const DELIVERY_TONES = {
  pending: 'warning',
  delivered: 'success',
  failed: 'danger',
} as const

function WebhooksPage() {
  const endpoints = usePolling<WebhookEndpointListDto>(
    () => api.get<WebhookEndpointListDto>('/v1/webhooks'),
    15_000,
    true,
  )
  const [editing, setEditing] = useState<WebhookEndpointDto | null>(null)
  const [url, setUrl] = useState('')
  const [events, setEvents] = useState<string[]>(['message.received'])
  const [active, setActive] = useState(true)
  const [secret, setSecret] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [deliveryStatus, setDeliveryStatus] = useState('all')
  const [deliveries, setDeliveries] = useState<WebhookDeliveryDto[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [deliveryError, setDeliveryError] = useState<string | null>(null)

  const items = endpoints.data?.items ?? []

  useEffect(() => {
    if (selected || items.length === 0) return
    setSelected(items[0]?.id ?? null)
  }, [items, selected])

  const loadDeliveries = useCallback(
    async (endpointId: string, cursor?: string) => {
      const status = deliveryStatus === 'all' ? '' : `&status=${deliveryStatus}`
      const page = await api.get<WebhookDeliveryListDto>(
        `/v1/webhooks/${endpointId}/deliveries?limit=20${status}${cursor ? `&cursor=${cursor}` : ''}`,
      )
      setDeliveries((current) => (cursor ? [...current, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
      setDeliveryError(null)
    },
    [deliveryStatus],
  )

  useEffect(() => {
    if (!selected) {
      setDeliveries([])
      setNextCursor(null)
      return
    }
    void loadDeliveries(selected).catch((error: unknown) =>
      setDeliveryError(error instanceof Error ? error.message : 'Gagal memuat log'),
    )
  }, [selected, loadDeliveries])

  function resetForm() {
    setEditing(null)
    setUrl('')
    setEvents(['message.received'])
    setActive(true)
  }

  function edit(endpoint: WebhookEndpointDto) {
    setEditing(endpoint)
    setUrl(endpoint.url)
    setEvents(endpoint.events)
    setActive(endpoint.active)
    setSecret(null)
  }

  function toggleEvent(event: string) {
    setEvents((current) =>
      current.includes(event) ? current.filter((value) => value !== event) : [...current, event],
    )
  }

  async function submit() {
    if (!url.trim() || events.length === 0) {
      setNotice({ tone: 'danger', text: 'URL dan minimal satu event wajib diisi.' })
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await api.patch(`/v1/webhooks/${editing.id}`, { url, events, active })
        setNotice({ tone: 'success', text: 'Endpoint diperbarui.' })
      } else {
        const created = await api.post<WebhookEndpointCreatedDto>('/v1/webhooks', {
          url,
          events,
          active,
        })
        setSecret(created.secret)
        setNotice({ tone: 'success', text: 'Endpoint dibuat. Simpan secret sekarang.' })
      }
      resetForm()
      endpoints.refresh()
    } catch (error) {
      setNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Gagal menyimpan endpoint',
      })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(endpoint: WebhookEndpointDto) {
    try {
      await api.patch(`/v1/webhooks/${endpoint.id}`, { active: !endpoint.active })
      endpoints.refresh()
    } catch (error) {
      setNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Gagal mengubah status',
      })
    }
  }

  async function rotate(endpoint: WebhookEndpointDto) {
    try {
      const result = await api.post<{ secret: string }>(
        `/v1/webhooks/${endpoint.id}/rotate-secret`,
      )
      setSecret(result.secret)
      setNotice({ tone: 'success', text: 'Secret dirotasi. Simpan secret baru sekarang.' })
    } catch (error) {
      setNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Gagal merotasi secret',
      })
    }
  }

  async function remove(endpoint: WebhookEndpointDto) {
    if (!window.confirm(`Hapus endpoint ${endpoint.url}?`)) return
    try {
      await api.delete(`/v1/webhooks/${endpoint.id}`)
      if (selected === endpoint.id) setSelected(null)
      endpoints.refresh()
    } catch (error) {
      setNotice({
        tone: 'danger',
        text: error instanceof Error ? error.message : 'Gagal menghapus endpoint',
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        eyebrow="SISTEM / WEBHOOK"
        title="Webhook"
        description="Kirim event pesan dan status sesi ke aplikasi internal lain."
        actions={
          <Button
            variant="secondary"
            className="h-[34px] px-3.5 text-[12.5px]"
            onClick={() => endpoints.refresh()}
          >
            <RefreshCw className="size-3.5 text-ink-soft" aria-hidden />
            Refresh
          </Button>
        }
      />

      <div className="h-6" />

      {secret ? (
        <Banner tone="success" icon={<KeyRound className="size-3.5" aria-hidden />}>
          Secret baru (hanya tampil sekali): <code className="font-data">{secret}</code>
        </Banner>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <Banner tone={notice.tone}>{notice.text}</Banner>
        </div>
      ) : null}
      {endpoints.error ? (
        <div className="mt-3">
          <Banner tone="danger">{endpoints.error}</Banner>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-card border border-line bg-surface p-[22px]">
          <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Endpoint</h2>
          <div className="h-4" />

          {items.length === 0 ? (
            <p className="py-8 text-center text-small text-ink-faint">
              {endpoints.loading ? 'Memuat endpoint…' : 'Belum ada endpoint webhook.'}
            </p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>URL</TableHeaderCell>
                  <TableHeaderCell>Event</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Aksi</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell>
                      <p className="max-w-[360px] truncate font-data text-small text-ink">
                        {endpoint.url}
                      </p>
                      <p className="font-data text-[9.5px] text-ink-faint">
                        {formatDateTime(endpoint.createdAt)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {endpoint.events.map((event) => (
                          <Badge key={event} tone="neutral" dot={false}>
                            {event}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <button type="button" onClick={() => void toggleActive(endpoint)}>
                        <Badge tone={endpoint.active ? 'success' : 'neutral'}>
                          {endpoint.active ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-[26px] px-[11px] text-[11px]"
                          onClick={() => setSelected(endpoint.id)}
                        >
                          Log
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-[26px] px-[11px] text-[11px]"
                          onClick={() => edit(endpoint)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-[26px] px-[9px] text-[11px]"
                          onClick={() => void rotate(endpoint)}
                          aria-label={`Rotasi secret ${endpoint.url}`}
                        >
                          <KeyRound className="size-3" aria-hidden />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-[26px] px-[9px] text-[11px]"
                          onClick={() => void remove(endpoint)}
                          aria-label={`Hapus ${endpoint.url}`}
                        >
                          <Trash2 className="size-3" aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="flex flex-col rounded-card border border-line bg-surface p-[22px]">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">
              {editing ? 'Edit endpoint' : 'Tambah endpoint'}
            </h2>
            {editing ? (
              <Button variant="ghost" size="sm" onClick={resetForm}>
                Batal
              </Button>
            ) : null}
          </div>

          <div className="h-4" />

          <div className="flex flex-col gap-3">
            <Field label="URL HTTPS" hint="HTTP hanya diizinkan untuk localhost.">
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/webhook"
              />
            </Field>

            <div className="flex flex-col gap-2">
              <p className="font-data text-caption text-ink-soft uppercase">Event</p>
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <Checkbox
                  key={event}
                  label={event}
                  checked={events.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
              ))}
            </div>

            <Checkbox label="Aktif" checked={active} onChange={(e) => setActive(e.target.checked)} />

            <Button disabled={saving} onClick={() => void submit()}>
              <Plus className="size-3.5" aria-hidden />
              {editing ? 'Simpan perubahan' : 'Tambah endpoint'}
            </Button>
          </div>
        </section>
      </div>

      <section className="mt-4 flex min-h-0 flex-1 flex-col rounded-card border border-line bg-surface p-[22px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.3px] text-ink">Log delivery</h2>
            <p className="text-small text-ink-faint">
              Percobaan kirim, status code, error, dan jadwal retry berikutnya.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              label="Pilih endpoint"
              className="w-[220px]"
              value={selected ?? ''}
              onChange={(next) => setSelected(next || null)}
              options={[
                { value: '', label: 'Pilih endpoint' },
                ...items.map((endpoint) => ({ value: endpoint.id, label: endpoint.url })),
              ]}
            />
            <Select
              label="Filter status delivery"
              className="w-[140px]"
              value={deliveryStatus}
              onChange={setDeliveryStatus}
              options={[
                { value: 'all', label: 'Semua status' },
                { value: 'pending', label: 'Pending' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'failed', label: 'Failed' },
              ]}
            />
          </div>
        </div>

        <div className="h-4" />
        {deliveryError ? <Banner tone="danger">{deliveryError}</Banner> : null}

        <div className="min-h-0 flex-1 overflow-auto">
          {!selected ? (
            <p className="py-8 text-center text-small text-ink-faint">
              Pilih endpoint untuk melihat log.
            </p>
          ) : deliveries.length === 0 ? (
            <p className="py-8 text-center text-small text-ink-faint">Belum ada delivery.</p>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Tanggal</TableHeaderCell>
                  <TableHeaderCell>Event</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Percobaan</TableHeaderCell>
                  <TableHeaderCell>HTTP</TableHeaderCell>
                  <TableHeaderCell>Error</TableHeaderCell>
                  <TableHeaderCell>Retry berikutnya</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deliveries.map((delivery) => (
                  <TableRow key={delivery.id}>
                    <TableCell className="whitespace-nowrap font-data text-[10.5px] text-ink-soft">
                      {formatDateTime(delivery.createdAt)}
                    </TableCell>
                    <TableCell className="font-data text-small">{delivery.eventType}</TableCell>
                    <TableCell>
                      <Badge tone={DELIVERY_TONES[delivery.status]}>{delivery.status}</Badge>
                    </TableCell>
                    <TableCell className="font-data text-small">{delivery.attempts}</TableCell>
                    <TableCell className="font-data text-small">
                      {delivery.lastStatusCode ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-small text-ink-soft">
                      {delivery.lastError ?? '—'}
                    </TableCell>
                    <TableCell className="font-data text-[10.5px] text-ink-soft">
                      {delivery.status === 'pending' ? formatDateTime(delivery.nextAttemptAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {nextCursor ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                selected &&
                void loadDeliveries(selected, nextCursor).catch((error: unknown) =>
                  setDeliveryError(error instanceof Error ? error.message : 'Gagal memuat log'),
                )
              }
            >
              Muat lebih
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
