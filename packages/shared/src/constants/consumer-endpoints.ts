/**
 * Katalog endpoint yang boleh dipakai aplikasi consumer lain (misalnya
 * remarketing). Dijaga test anti-drift di backend agar setiap entri tetap ada
 * di dokumen OpenAPI.
 */

export const CONSUMER_ENDPOINT_GROUPS = [
  'numbers',
  'messages',
  'conversations',
  'events',
  'broadcasts',
  'webhooks',
] as const

export type ConsumerEndpointGroup = (typeof CONSUMER_ENDPOINT_GROUPS)[number]

export const CONSUMER_ENDPOINT_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'] as const

export type ConsumerEndpointMethod = (typeof CONSUMER_ENDPOINT_METHODS)[number]

export type ConsumerEndpoint = {
  readonly method: ConsumerEndpointMethod
  readonly path: string
  readonly group: ConsumerEndpointGroup
  readonly summary: string
  readonly auth: 'x-api-key'
}

export const CONSUMER_ENDPOINTS = [
  {
    method: 'GET',
    path: '/sessions',
    group: 'numbers',
    summary: 'Daftar nomor; ambil publicId yang berstatus connected.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}',
    group: 'numbers',
    summary: 'Detail satu nomor.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}/status',
    group: 'numbers',
    summary: 'Status ringkas nomor.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/messages',
    group: 'messages',
    summary: 'Kirim teks lintas sesi dengan sessionId, to, text, dan clientRef.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/conversations',
    group: 'conversations',
    summary: 'Daftar room chat, urut lastMessageAt terbaru.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/conversations/{id}/messages',
    group: 'conversations',
    summary: 'Riwayat pesan satu room.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/conversations/{id}/read',
    group: 'conversations',
    summary: 'Tandai room sudah dibaca.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}/messages',
    group: 'conversations',
    summary: 'Riwayat pesan per nomor sebagai alternatif.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/events',
    group: 'events',
    summary: 'Stream SSE: pesan masuk, status pesan, status sesi.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts',
    group: 'broadcasts',
    summary: 'Buat broadcast teks, opsional scheduledAt (ISO-8601 UTC).',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/broadcasts/{id}',
    group: 'broadcasts',
    summary: 'Status, progres, dan status per penerima.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts/{id}/start',
    group: 'broadcasts',
    summary: 'Mulai broadcast terjadwal atau lanjutkan yang dijeda.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts/{id}/pause',
    group: 'broadcasts',
    summary: 'Jeda broadcast berjalan.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/webhooks',
    group: 'webhooks',
    summary: 'Daftar endpoint webhook.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/webhooks',
    group: 'webhooks',
    summary: 'Daftarkan endpoint dan event; secret tampil sekali.',
    auth: 'x-api-key',
  },
  {
    method: 'PATCH',
    path: '/v1/webhooks/{id}',
    group: 'webhooks',
    summary: 'Ubah URL, event, atau status aktif.',
    auth: 'x-api-key',
  },
  {
    method: 'DELETE',
    path: '/v1/webhooks/{id}',
    group: 'webhooks',
    summary: 'Hapus endpoint beserta log delivery.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/webhooks/{id}/rotate-secret',
    group: 'webhooks',
    summary: 'Rotasi secret endpoint.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/webhooks/{id}/deliveries',
    group: 'webhooks',
    summary: 'Log delivery endpoint.',
    auth: 'x-api-key',
  },
] as const satisfies readonly ConsumerEndpoint[]
