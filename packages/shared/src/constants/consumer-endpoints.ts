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
  readonly detail: string
  readonly auth: 'x-api-key'
}

export const CONSUMER_ENDPOINTS = [
  {
    method: 'GET',
    path: '/sessions',
    group: 'numbers',
    summary: 'Daftar nomor; ambil publicId yang berstatus connected.',
    detail:
      'publicId dipakai sebagai sessionId di endpoint lain. Jangan memakai id internal sesi.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}',
    group: 'numbers',
    summary: 'Detail satu nomor.',
    detail: 'Berguna untuk cek label, nomor WhatsApp, status koneksi, dan batas kirim harian.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}/status',
    group: 'numbers',
    summary: 'Status ringkas nomor.',
    detail: 'Polling ringan saat hanya butuh status koneksi tanpa detail penuh.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/messages',
    group: 'messages',
    summary: 'Kirim teks lintas sesi dengan sessionId, to, text, dan clientRef.',
    detail:
      '202 berarti masuk antrean, 200 berarti clientRef sudah pernah dipakai. Status final datang lewat webhook atau GET riwayat.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/conversations',
    group: 'conversations',
    summary: 'Daftar room chat, urut lastMessageAt terbaru.',
    detail:
      'Pakai nextCursor untuk halaman berikutnya; unreadCount membantu memilih room yang perlu dibalas.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/conversations/{id}/messages',
    group: 'conversations',
    summary: 'Riwayat pesan satu room.',
    detail: 'Berisi pesan masuk dan keluar; cursor dipakai untuk membaca riwayat yang lebih lama.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/conversations/{id}/read',
    group: 'conversations',
    summary: 'Tandai room sudah dibaca.',
    detail: 'Meriset unreadCount setelah sales membaca percakapan.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/sessions/{id}/messages',
    group: 'conversations',
    summary: 'Riwayat pesan per nomor sebagai alternatif.',
    detail: 'Berguna untuk sinkronisasi awal atau audit lintas room pada satu nomor.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/events',
    group: 'events',
    summary: 'Stream SSE: pesan masuk, status pesan, status sesi.',
    detail:
      'Gunakan fetch streaming dengan header x-api-key, bukan EventSource. Sambungkan ulang bila koneksi terputus.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts',
    group: 'broadcasts',
    summary: 'Buat broadcast teks, opsional scheduledAt (ISO-8601 UTC).',
    detail:
      'Maksimal 1000 penerima dengan jeda 10-600 detik. clientRef mencegah duplikasi; ref per penerima memudahkan mapping ke data consumer.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/broadcasts/{id}',
    group: 'broadcasts',
    summary: 'Status, progres, dan status per penerima.',
    detail:
      'Sumber kebenaran status broadcast. Webhook hanya notifikasi; detail per penerima ada di recipients.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts/{id}/start',
    group: 'broadcasts',
    summary: 'Mulai broadcast terjadwal atau lanjutkan yang dijeda.',
    detail: 'Hanya berlaku untuk broadcast scheduled atau paused; broadcast final tidak bisa dimulai.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/broadcasts/{id}/pause',
    group: 'broadcasts',
    summary: 'Jeda broadcast berjalan.',
    detail: 'Penerima yang belum diproses tetap pending dan dilanjutkan lewat start.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/webhooks',
    group: 'webhooks',
    summary: 'Daftar endpoint webhook.',
    detail: 'Secret tidak dikembalikan. Cocok untuk audit endpoint dan event yang disubscribe.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/webhooks',
    group: 'webhooks',
    summary: 'Daftarkan endpoint dan event; secret tampil sekali.',
    detail: 'Simpan secret di server consumer karena tidak bisa dilihat lagi. Pilih hanya event yang dipakai.',
    auth: 'x-api-key',
  },
  {
    method: 'PATCH',
    path: '/v1/webhooks/{id}',
    group: 'webhooks',
    summary: 'Ubah URL, event, atau status aktif.',
    detail:
      'Menonaktifkan endpoint membuat delivery tertunda gagal; event baru tidak lagi dikirim ke sana.',
    auth: 'x-api-key',
  },
  {
    method: 'DELETE',
    path: '/v1/webhooks/{id}',
    group: 'webhooks',
    summary: 'Hapus endpoint beserta log delivery.',
    detail: 'Penghapusan permanen; delivery historis ikut hilang.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/webhooks/{id}/rotate-secret',
    group: 'webhooks',
    summary: 'Rotasi secret endpoint.',
    detail: 'Perbarui secret di penerima segera setelah rotasi karena secret lama langsung tidak valid.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/webhooks/{id}/deliveries',
    group: 'webhooks',
    summary: 'Log delivery endpoint.',
    detail: 'Untuk debugging kegagalan; pakai filter status dan cursor, bukan polling terlalu sering.',
    auth: 'x-api-key',
  },
] as const satisfies readonly ConsumerEndpoint[]
