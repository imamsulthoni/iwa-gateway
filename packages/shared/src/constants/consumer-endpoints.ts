/**
 * Katalog endpoint yang boleh dipakai aplikasi consumer lain (misalnya
 * remarketing). Dijaga test anti-drift di backend agar setiap entri tetap ada
 * di dokumen OpenAPI.
 */

export const CONSUMER_ENDPOINT_GROUPS = [
  'pairing',
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
    method: 'POST',
    path: '/v1/sessions',
    group: 'pairing',
    summary: 'Buat sesi baru lalu tampilkan QR untuk ditautkan ke WhatsApp.',
    detail:
      'Mode qr tidak perlu phoneNumber karena nomor terbaca otomatis setelah scan. Simpan id dari respons: id itu dipakai di seluruh endpoint lain, sedangkan token hanya untuk kirim pesan.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/sessions/{id}/login',
    group: 'pairing',
    summary: 'Nyalakan socket sesi agar QR mulai diterbitkan.',
    detail:
      'Opsional: worker menyalakan sesi baru otomatis dalam siklus rekonsiliasi 15 detik. Sesi yang sudah connected ditolak 409 karena socket-nya sudah hidup; logout dulu untuk pairing ulang.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/qr',
    group: 'pairing',
    summary: 'QR terbaru sebagai data-URL PNG, siap dipasang di tag img.',
    detail:
      'QR berganti tiap ~20 detik dan kosong setelah terhubung. Polling 3 detik saat pairing; berhenti setelah status connected.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/live',
    group: 'pairing',
    summary: 'Satu panggilan berisi sesi, QR, dan status broadcast.',
    detail:
      'Menggantikan polling terpisah ke detail sesi dan QR. Cocok untuk polling 3 detik selama pairing lalu 15 detik setelah terhubung.',
    auth: 'x-api-key',
  },
  {
    method: 'POST',
    path: '/v1/sessions/{id}/cancel',
    group: 'pairing',
    summary: 'Batalkan pairing dan kosongkan QR yang beredar.',
    detail:
      'Sesi kembali disconnected dan auth dihapus, sehingga QR lama tidak bisa dipakai lagi.',
    auth: 'x-api-key',
  },
  {
    method: 'PATCH',
    path: '/v1/sessions/{id}/sales',
    group: 'pairing',
    summary: 'Daftarkan akun sales setelah nomor tertaut.',
    detail:
      'Wajib dipanggil setelah status connected karena butuh phoneNumber hasil scan. Tanpa langkah ini sesi hanya bisa dikelola admin.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions',
    group: 'numbers',
    summary: 'Daftar nomor; ambil id (UUID) yang berstatus connected.',
    detail:
      'id (UUID wa_sessions.id) dipakai sebagai sessionId di endpoint lain. publicId hanya label tampilan, bukan identifier.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}',
    group: 'numbers',
    summary: 'Detail satu nomor.',
    detail: 'Berguna untuk cek label, nomor WhatsApp, status koneksi, dan batas kirim harian.',
    auth: 'x-api-key',
  },
  {
    method: 'GET',
    path: '/v1/sessions/{id}/status',
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
    path: '/v1/sessions/{id}/messages',
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
