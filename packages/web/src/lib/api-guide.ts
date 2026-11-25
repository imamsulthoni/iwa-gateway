import type { ConsumerEndpoint, ConsumerEndpointGroup } from '@wbc/shared'

export type CodeSample = {
  id: 'fetch' | 'axios' | 'curl'
  label: string
  code: string
}

export type GuideBlock = {
  title: string
  detail: string
  samples?: CodeSample[]
}

export type ApiGroup = {
  id: ConsumerEndpointGroup
  label: string
  note: string
}

export const API_GROUPS: readonly ApiGroup[] = [
  {
    id: 'pairing',
    label: 'Pairing nomor',
    note: 'Tautkan WhatsApp baru lewat QR, lalu daftarkan sales.',
  },
  { id: 'numbers', label: 'Nomor', note: 'Pilih nomor yang berstatus connected.' },
  { id: 'messages', label: 'Kirim pesan', note: 'Idempoten lewat clientRef unik.' },
  {
    id: 'conversations',
    label: 'Room & riwayat',
    note: 'Baca konteks percakapan sebelum follow-up.',
  },
  { id: 'events', label: 'Realtime', note: 'SSE untuk balasan dan status.' },
  { id: 'broadcasts', label: 'Broadcast', note: 'Kirim massal dengan delay acak.' },
  { id: 'webhooks', label: 'Webhook', note: 'Terima event tanpa polling.' },
]

export const AUTH_GUIDE = {
  title: 'Autentikasi',
  detail:
    'Semua endpoint consumer memakai header x-api-key. Key dibuat admin lewat perintah di bawah; key hanya boleh disimpan di server aplikasi consumer, jangan pernah ditempel di frontend.',
  createKeyCommand: 'pnpm --filter @wbc/backend db:seed:key',
  samples: [
    {
      id: 'curl',
      label: 'Header',
      code: 'curl https://api.example.com/v1/sessions \\\n  -H "x-api-key: $WA_API_KEY"',
    },
  ] satisfies CodeSample[],
}

export const CONVENTIONS: readonly GuideBlock[] = [
  {
    title: 'Format error',
    detail:
      'Semua error memakai bentuk yang sama. Baca code untuk bercabang, bukan message yang bisa berubah.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "error": {\n    "code": "UNAUTHORIZED",\n    "message": "API key tidak dikirim atau tidak valid"\n  }\n}',
      },
    ],
  },
  {
    title: 'Pagination',
    detail:
      'Daftar memakai limit (default 20, maksimum 100) dan cursor opak. Kirim cursor dari nextCursor untuk halaman berikutnya; null berarti habis.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "items": [],\n  "nextCursor": "eyJpZCI6IjAxYTFkZGZhIn0"\n}',
      },
    ],
  },
  {
    title: 'Nomor telepon',
    detail: 'Kirim 8–15 digit tanpa tanda +, spasi, atau tanda baca. Contoh: 6281234567890.',
  },
  {
    title: 'Waktu',
    detail: 'Semua waktu ISO-8601 UTC, misalnya 2026-11-18T03:00:00.000Z.',
  },
  {
    title: 'Rate limit',
    detail:
      'Respons 429 menyertakan header Retry-After dalam detik. Berhenti mengirim lalu coba lagi setelah jeda tersebut.',
    samples: [
      {
        id: 'fetch',
        label: 'HTTP',
        code: 'HTTP/1.1 429 Too Many Requests\nRetry-After: 30\n\n{ "error": { "code": "RATE_LIMITED", "message": "..." } }',
      },
    ],
  },
]

export const FLOW_STEPS: readonly GuideBlock[] = [
  {
    title: 'Cari nomor yang terhubung',
    detail:
      'Panggil GET /v1/sessions, lalu simpan id (UUID) dari item berstatus connected. id dipakai sebagai sessionId di endpoint lain; publicId hanya label tampilan.',
  },
  {
    title: 'Kirim pesan follow-up',
    detail:
      'POST /v1/messages dengan sessionId, to, text, dan clientRef unik per pesan. Balasan 202 berarti masuk antrean, 200 duplikat, 422 bila nomor belum terhubung.',
  },
  {
    title: 'Terima balasan',
    detail:
      'Pasang webhook message.received, atau baca SSE GET /v1/sessions/{id}/events bila aplikasi consumer butuh kanal realtime sendiri.',
  },
  {
    title: 'Ambil konteks percakapan',
    detail:
      'GET /v1/sessions/{id}/conversations untuk daftar room, lalu GET /v1/conversations/{id}/messages untuk riwayat pesan room tersebut.',
  },
]

export const WEBHOOK_EVENTS: readonly GuideBlock[] = [
  {
    title: 'message.received',
    detail: 'Pesan masuk dari pelanggan.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f60",\n  "type": "message.received",\n  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",\n  "data": {\n    "message_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",\n    "conversation_id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",\n    "from": "6281234567890@s.whatsapp.net",\n    "type": "text",\n    "body": "Halo, masih ada promo?",\n    "occurred_at": "2026-11-18T03:00:00.000Z"\n  }\n}',
      },
    ],
  },
  {
    title: 'message.status',
    detail: 'Perubahan status pesan keluar.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63",\n  "type": "message.status",\n  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",\n  "data": {\n    "message_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",\n    "client_ref": "followup-2026-11-18-001",\n    "to": "6281234567890@s.whatsapp.net",\n    "phone": "6281234567890",\n    "status": "delivered",\n    "occurred_at": "2026-11-18T03:00:05.000Z"\n  }\n}',
      },
    ],
  },
  {
    title: 'session.status',
    detail: 'Nomor terhubung, terputus, atau keluar.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f64",\n  "type": "session.status",\n  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",\n  "data": {\n    "status": "connected",\n    "phone_number": "628123456789",\n    "occurred_at": "2026-11-18T03:00:00.000Z"\n  }\n}',
      },
    ],
  },
  {
    title: 'broadcast.recipient',
    detail: 'Satu penerima broadcast selesai: sent, failed, atau skipped.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63",\n  "type": "broadcast.recipient",\n  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",\n  "data": {\n    "broadcast_id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",\n    "recipient_id": 42,\n    "to": "628123456789@s.whatsapp.net",\n    "phone": "628123456789",\n    "ref": "crm-8821",\n    "status": "failed",\n    "message_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",\n    "error": "connection closed",\n    "occurred_at": "2026-11-22T03:00:05.000Z"\n  }\n}',
      },
    ],
  },
  {
    title: 'broadcast.status',
    detail: 'Broadcast terminal: done, paused, failed, atau cancelled.',
    samples: [
      {
        id: 'fetch',
        label: 'JSON',
        code: '{\n  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65",\n  "type": "broadcast.status",\n  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",\n  "data": {\n    "broadcast_id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",\n    "status": "done",\n    "total": 2,\n    "sent": 1,\n    "failed": 1,\n    "skipped": 0,\n    "opted_out": 0,\n    "pause_reason": null,\n    "occurred_at": "2026-11-22T03:00:06.000Z"\n  }\n}',
      },
    ],
  },
]

export const WEBHOOK_DELIVERY = {
  title: 'Aturan pengiriman webhook',
  points: [
    'Header X-Event-Id stabil antar retry; pakai nilainya untuk idempoten di sisi penerima.',
    'Header X-Signature berisi sha256=<HMAC-SHA256(body mentah, secret endpoint)>.',
    'Timeout 10 detik, maksimal 3 percobaan dengan jeda 10 detik lalu 20 detik.',
    'Balas 2xx secepat mungkin. Proses lanjutan sebaiknya diantrekan di sisi penerima.',
    'broadcast.recipient idempoten lewat (broadcast_id, recipient_id). sent berarti Baileys berhasil kirim, bukan delivered/read; sumber kebenaran tetap GET /v1/broadcasts/{id}.',
  ],
  verifySample:
    "import { createHmac, timingSafeEqual } from 'node:crypto'\n\nconst expected = `sha256=${createHmac('sha256', process.env.WA_WEBHOOK_SECRET!)\n  .update(rawBody)\n  .digest('hex')}`\nconst valid = timingSafeEqual(Buffer.from(expected), Buffer.from(signature))",
} as const

export const NOT_FOR_CONSUMERS: readonly { label: string; items: readonly string[] }[] = [
  { label: 'Dashboard internal', items: ['/v1/auth/*', '/v1/settings', '/v1/stats'] },
  {
    label: 'Manajemen sesi',
    items: [
      'DELETE /v1/sessions/{id}',
      '/v1/sessions/{id}/logout',
      '/v1/sessions/{id}/pairing',
      '/v1/sessions/{id}/token',
      '/v1/sessions/{id}/sales/pin',
    ],
  },
  {
    label: 'Admin pesan & legacy',
    items: ['/v1/messages', '/v1/messages/{id}/retry', '/v1/sessions/{id}/broadcast*'],
  },
]

export const PAIRING_FLOW = {
  detail:
    'Alur menautkan nomor WhatsApp dari aplikasi consumer. Sesi dan akun sales tetap tercatat di console, jadi setelah pairing nomor langsung muncul di dashboard.',
  steps: [
    {
      title: 'Buat sesi bermode QR',
      detail:
        'POST /v1/sessions dengan label dan mode qr. Jangan isi phoneNumber: nomor belum diketahui dan terisi otomatis dari perangkat setelah scan. Simpan session.id dari respons.',
    },
    {
      title: 'Nyalakan socket',
      detail:
        'Worker menyalakan sesi baru otomatis dalam siklus rekonsiliasi 15 detik. Panggil POST /v1/sessions/{id}/login hanya bila tidak mau menunggu. Sesi berstatus connected dibalas 409, jadi cukup cek status dulu sebelum memanggil.',
    },
    {
      title: 'Tampilkan QR',
      detail:
        'GET /v1/sessions/{id}/qr mengembalikan data-URL PNG siap dipasang di tag img, atau pakai GET /v1/sessions/{id}/live untuk sesi sekaligus QR. QR berganti tiap ~20 detik.',
    },
    {
      title: 'Tunggu status connected',
      detail:
        'Setelah discan, status berubah connecting lalu connected dan phoneNumber terisi. connecting sesaat itu normal karena Baileys meminta restart socket setelah pairing.',
    },
    {
      title: 'Daftarkan akun sales',
      detail:
        'PATCH /v1/sessions/{id}/sales dengan salesName dan pin. Wajib setelah connected karena butuh nomor hasil scan. Tanpa langkah ini sesi hanya bisa dikelola admin.',
    },
  ],
  cautions: [
    'Polling 3 detik saat pairing lalu 15 detik setelah connected. Rate limit dihitung per API key, jadi banyak sesi yang pairing bersamaan memakai kuota yang sama.',
    'QR selalu berubah, jangan di-cache. Nilai qr menjadi null setelah sesi terhubung.',
    'POST /v1/sessions/{id}/pairing selalu 409: pairing dengan kode dinonaktifkan, pairing hanya lewat QR.',
    'Batalkan lewat POST /v1/sessions/{id}/cancel. QR lama langsung tidak berlaku karena auth sesi dihapus.',
    'Satu nomor hanya boleh dipakai satu sesi dan satu akun sales; duplikat ditolak 409.',
  ],
  statusSample: [
    'created        -> sesi dibuat, belum ada socket',
    'qr_pending     -> QR terbit, menunggu scan',
    'connecting     -> perangkat tertaut, socket menyambung ulang',
    'connected      -> siap mengirim dan menerima pesan',
    'disconnected   -> socket tertutup, scan ulang lewat /login',
    'logged_out     -> perangkat dilepas, auth dihapus',
  ].join('\n'),
  pollSample: [
    'const API_KEY = process.env.WA_API_KEY!',
    "const base = 'https://api.example.com/v1'",
    'const sessionId = process.env.WA_SESSION_ID!',
    '',
    'for (;;) {',
    '  const res = await fetch(`${base}/sessions/${sessionId}/live`, {',
    "    headers: { 'x-api-key': API_KEY },",
    '  })',
    '  if (!res.ok) throw new Error(`Gagal memuat sesi: ${res.status}`)',
    '',
    '  const live = await res.json()',
    "  if (live.session.status === 'connected') {",
    "    console.log('Nomor tertaut:', live.session.phoneNumber)",
    '    break',
    '  }',
    '  if (live.qr) renderQrImage(live.qr)',
    '',
    '  await new Promise((resolve) => setTimeout(resolve, 3000))',
    '}',
  ].join('\n'),
} as const

const EXAMPLE_SESSION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc047b'
const EXAMPLE_CONVERSATION_ID = '01a1ddfa-295a-7557-9bd3-00293fdc047c'
const EXAMPLE_BROADCAST_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0480'
const EXAMPLE_WEBHOOK_ID = '01a1ddfa-295a-7557-9bd3-00293fdc0490'

type EndpointExample = {
  query?: string
  body?: Record<string, unknown>
  response: { language: string; code: string }
}

function exampleId(path: string): string {
  if (path.startsWith('/v1/webhooks')) return EXAMPLE_WEBHOOK_ID
  if (path.startsWith('/v1/broadcasts')) return EXAMPLE_BROADCAST_ID
  if (path.startsWith('/v1/conversations')) return EXAMPLE_CONVERSATION_ID
  return EXAMPLE_SESSION_ID
}

const MESSAGE_ITEM = `{
    "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",
    "sessionId": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
    "to": "6281234567890@s.whatsapp.net",
    "clientRef": "followup-2026-11-18-001",
    "body": "Halo, kami ingin menawarkan promo.",
    "status": "queued",
    "waMessageId": null,
    "error": null,
    "customerName": "Budi",
    "salesName": "Budi",
    "createdAt": "2026-11-18T03:00:00.000Z",
    "deletedAt": null
  }`

const ENDPOINT_EXAMPLES: Record<string, EndpointExample> = {
  'POST /v1/sessions': {
    body: {
      label: 'Sales Budi',
      mode: 'qr',
    },
    response: {
      language: 'json',
      code: `{
  "token": "sess_9f2a4c6e8b1d3f5a",
  "session": {
    "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
    "publicId": "a1b2c3d4e5f6",
    "label": "Sales Budi",
    "phoneNumber": null,
    "status": "created",
    "lastConnectedAt": null,
    "salesId": null,
    "agentId": null,
    "salesName": null,
    "createdAt": "2026-11-18T02:59:00.000Z"
  }
}`,
    },
  },
  'POST /v1/sessions/{id}/login': {
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "publicId": "a1b2c3d4e5f6",
  "label": "Sales Budi",
  "phoneNumber": null,
  "status": "connecting",
  "lastConnectedAt": null,
  "salesId": null,
  "agentId": null,
  "salesName": null,
  "createdAt": "2026-11-18T02:59:00.000Z"
}`,
    },
  },
  'GET /v1/sessions/{id}/qr': {
    response: {
      language: 'json',
      code: `{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_pending",
  "reason": null
}`,
    },
  },
  'GET /v1/sessions/{id}/live': {
    response: {
      language: 'json',
      code: `{
  "session": {
    "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
    "publicId": "a1b2c3d4e5f6",
    "label": "Sales Budi",
    "phoneNumber": null,
    "status": "qr_pending",
    "lastConnectedAt": null,
    "salesId": null,
    "agentId": null,
    "salesName": null,
    "createdAt": "2026-11-18T02:59:00.000Z"
  },
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "pairingCode": null,
  "reason": null,
  "broadcast": {
    "jobId": null,
    "status": null,
    "total": 0,
    "done": 0,
    "sent": 0,
    "failed": 0,
    "skipped": 0,
    "optedOut": 0,
    "scheduledAt": null,
    "pauseReason": null,
    "recipients": []
  },
  "defaultDelay": { "min": 10, "max": 30 }
}`,
    },
  },
  'POST /v1/sessions/{id}/cancel': {
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "publicId": "a1b2c3d4e5f6",
  "label": "Sales Budi",
  "phoneNumber": null,
  "status": "disconnected",
  "lastConnectedAt": null,
  "salesId": null,
  "agentId": null,
  "salesName": null,
  "createdAt": "2026-11-18T02:59:00.000Z"
}`,
    },
  },
  'PATCH /v1/sessions/{id}/sales': {
    body: {
      salesName: 'Budi',
      pin: '4821',
    },
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "publicId": "a1b2c3d4e5f6",
  "label": "Sales Budi",
  "phoneNumber": "628123456789",
  "status": "connected",
  "lastConnectedAt": "2026-11-18T03:00:10.000Z",
  "salesId": null,
  "agentId": null,
  "salesName": "Budi",
  "createdAt": "2026-11-18T02:59:00.000Z"
}`,
    },
  },
  'GET /v1/sessions': {
    response: {
      language: 'json',
      code: `{
  "items": [
    {
      "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
      "publicId": "smoke",
      "label": "Sales Budi",
      "phoneNumber": "628123456789",
      "status": "connected",
      "lastConnectedAt": "2026-11-18T01:12:00.000Z",
      "salesId": "sales-1",
      "agentId": null,
      "salesName": "Budi",
      "createdAt": "2026-11-01T02:00:00.000Z"
    }
  ],
  "nextCursor": null
}`,
    },
  },
  'GET /v1/sessions/{id}': {
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "publicId": "smoke",
  "label": "Sales Budi",
  "phoneNumber": "628123456789",
  "status": "connected",
  "lastConnectedAt": "2026-11-18T01:12:00.000Z",
  "salesId": "sales-1",
  "agentId": null,
  "salesName": "Budi",
  "createdAt": "2026-11-01T02:00:00.000Z"
}`,
    },
  },
  'GET /v1/sessions/{id}/status': {
    response: {
      language: 'json',
      code: `{
  "status": "connected",
  "statusLabel": "Terhubung",
  "phoneNumber": "628123456789",
  "salesId": "sales-1",
  "agentId": null
}`,
    },
  },
  'POST /v1/messages': {
    body: {
      sessionId: EXAMPLE_SESSION_ID,
      to: '6281234567890',
      text: 'Halo, kami ingin menawarkan promo.',
      clientRef: 'followup-2026-11-18-001',
    },
    response: {
      language: 'json',
      code: `{
  "message": ${MESSAGE_ITEM},
  "duplicate": false
}`,
    },
  },
  'GET /v1/sessions/{id}/conversations': {
    query: '?limit=20',
    response: {
      language: 'json',
      code: `{
  "items": [
    {
      "id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",
      "sessionId": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
      "waJid": "6281234567890@s.whatsapp.net",
      "waJidAlt": null,
      "lastMessageAt": "2026-11-18T03:00:00.000Z",
      "unreadCount": 2,
      "customerNames": "Budi, Sari"
    }
  ],
  "nextCursor": null
}`,
    },
  },
  'GET /v1/conversations/{id}/messages': {
    query: '?limit=20',
    response: {
      language: 'json',
      code: `{
  "items": [
    {
      "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",
      "conversationId": "01a1ddfa-295a-7557-9bd3-00293fdc047c",
      "sessionId": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
      "direction": "in",
      "type": "text",
      "body": "Halo, masih ada promo?",
      "status": "delivered",
      "clientRef": null,
      "waMessageId": "3EB0A1B2C3D4",
      "createdAt": "2026-11-18T03:00:00.000Z"
    }
  ],
  "nextCursor": null
}`,
    },
  },
  'POST /v1/conversations/{id}/read': {
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",
  "sessionId": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "waJid": "6281234567890@s.whatsapp.net",
  "waJidAlt": null,
  "lastMessageAt": "2026-11-18T03:00:00.000Z",
  "unreadCount": 0,
  "customerNames": "Budi, Sari"
}`,
    },
  },
  'GET /v1/sessions/{id}/messages': {
    query: '?limit=20&direction=in',
    response: {
      language: 'json',
      code: `{
  "items": [${MESSAGE_ITEM}],
  "nextCursor": null
}`,
    },
  },
  'GET /v1/sessions/{id}/events': {
    response: {
      language: 'text',
      code: `: ping

id: 0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65
event: message.received
data: {"message":{"id":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62","conversationId":"01a1ddfa-295a-7557-9bd3-00293fdc047c","sessionId":"01a1ddfa-295a-7557-9bd3-00293fdc047b","direction":"in","type":"text","body":"Halo","status":"delivered","clientRef":null,"waMessageId":"3EB0A1B2C3D4","createdAt":"2026-11-18T03:00:00.000Z"}}`,
    },
  },
  'POST /v1/broadcasts': {
    body: {
      sessionId: EXAMPLE_SESSION_ID,
      recipients: [
        { to: '6281234567890', name: 'Budi' },
        { to: '6281299998888', name: 'Sari' },
      ],
      text: 'Promo akhir tahun: diskon 20%.',
      minDelay: 10,
      maxDelay: 30,
      clientRef: 'promo-2026-11-18',
      scheduledAt: '2026-11-18T10:00:00.000Z',
    },
    response: {
      language: 'json',
      code: `{
  "broadcastId": "01a1ddfa-295a-7557-9bd3-00293fdc0480",
  "jobId": "01a1ddfa-295a-7557-9bd3-00293fdc0480",
  "status": "scheduled"
}`,
    },
  },
  'GET /v1/broadcasts/{id}': {
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc0480",
  "sessionId": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "text": "Promo akhir tahun: diskon 20%.",
  "clientRef": "promo-2026-11-18",
  "status": "running",
  "total": 2,
  "done": 1,
  "sent": 1,
  "failed": 0,
  "skipped": 0,
  "optedOut": 0,
  "scheduledAt": "2026-11-18T10:00:00.000Z",
  "startedAt": "2026-11-18T10:00:00.000Z",
  "finishedAt": null,
  "pauseReason": null,
  "recipients": [
    {
      "id": 1,
      "to": "6281234567890",
      "name": "Budi",
      "status": "sent",
      "error": null
    },
    {
      "id": 2,
      "to": "6281299998888",
      "name": "Sari",
      "status": "pending",
      "error": null
    }
  ]
}`,
    },
  },
  'POST /v1/broadcasts/{id}/start': {
    response: {
      language: 'json',
      code: '{\n  "broadcastId": "01a1ddfa-295a-7557-9bd3-00293fdc0480",\n  "status": "running"\n}',
    },
  },
  'POST /v1/broadcasts/{id}/pause': {
    response: {
      language: 'json',
      code: '{\n  "broadcastId": "01a1ddfa-295a-7557-9bd3-00293fdc0480",\n  "status": "paused"\n}',
    },
  },
  'GET /v1/webhooks': {
    response: {
      language: 'json',
      code: `{
  "items": [
    {
      "id": "01a1ddfa-295a-7557-9bd3-00293fdc0490",
      "url": "https://remarketing.example.com/hooks/wa",
      "events": ["message.received", "message.status"],
      "active": true,
      "createdAt": "2026-11-10T02:00:00.000Z"
    }
  ]
}`,
    },
  },
  'POST /v1/webhooks': {
    body: {
      url: 'https://remarketing.example.com/hooks/wa',
      events: ['message.received', 'message.status'],
      active: true,
    },
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc0490",
  "url": "https://remarketing.example.com/hooks/wa",
  "events": ["message.received", "message.status"],
  "active": true,
  "createdAt": "2026-11-18T03:00:00.000Z",
  "secret": "whsec_9f2a4c6e8b1d3f5a"
}`,
    },
  },
  'PATCH /v1/webhooks/{id}': {
    body: {
      events: ['message.received', 'message.status', 'session.status'],
      active: true,
    },
    response: {
      language: 'json',
      code: `{
  "id": "01a1ddfa-295a-7557-9bd3-00293fdc0490",
  "url": "https://remarketing.example.com/hooks/wa",
  "events": ["message.received", "message.status", "session.status"],
  "active": true,
  "createdAt": "2026-11-10T02:00:00.000Z"
}`,
    },
  },
  'DELETE /v1/webhooks/{id}': {
    response: { language: 'text', code: 'HTTP/1.1 204 No Content' },
  },
  'POST /v1/webhooks/{id}/rotate-secret': {
    response: {
      language: 'json',
      code: '{\n  "secret": "whsec_5b8d1e3f7a9c2b4d"\n}',
    },
  },
  'GET /v1/webhooks/{id}/deliveries': {
    query: '?limit=20&status=failed',
    response: {
      language: 'json',
      code: `{
  "items": [
    {
      "id": "01a1ddfa-295a-7557-9bd3-00293fdc04a0",
      "endpointId": "01a1ddfa-295a-7557-9bd3-00293fdc0490",
      "eventType": "message.received",
      "status": "failed",
      "attempts": 3,
      "nextAttemptAt": "2026-11-18T03:01:00.000Z",
      "lastStatusCode": 500,
      "lastError": "HTTP 500",
      "createdAt": "2026-11-18T03:00:00.000Z"
    }
  ],
  "nextCursor": null
}`,
    },
  },
}

function endpointKey(endpoint: ConsumerEndpoint): string {
  return `${endpoint.method} ${endpoint.path}`
}

function jsonLines(body: unknown, indent: string): string {
  return JSON.stringify(body, null, 2)
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${indent}${line}`))
    .join('\n')
}

function fillPath(path: string): string {
  return path.replaceAll('{id}', exampleId(path))
}

function buildFetchSample(
  endpoint: ConsumerEndpoint,
  url: string,
  body?: Record<string, unknown>,
): string {
  if (endpoint.group === 'events') {
    return [
      'const API_KEY = process.env.WA_API_KEY!',
      '',
      `const res = await fetch('${url}', { headers: { 'x-api-key': API_KEY } })`,
      `if (!res.ok || !res.body) throw new Error('Stream gagal dibuka: ' + res.status)`,
      '',
      'const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()',
      'for (;;) {',
      '  const { value, done } = await reader.read()',
      '  if (done) break',
      '  process.stdout.write(value)',
      '}',
    ].join('\n')
  }

  const lines = [
    'const API_KEY = process.env.WA_API_KEY!',
    '',
    `const res = await fetch('${url}', {`,
    `  method: '${endpoint.method}',`,
    '  headers: {',
    "    'x-api-key': API_KEY,",
  ]
  if (body) lines.push("    'content-type': 'application/json',")
  lines.push('  },')
  if (body) lines.push(`  body: JSON.stringify(${jsonLines(body, '  ')}),`)
  lines.push('})', '')
  lines.push('const data = res.status === 204 ? null : await res.json()')
  lines.push("if (!res.ok) throw new Error(data?.error?.message ?? 'Permintaan gagal')")
  return lines.join('\n')
}

function buildAxiosSample(
  endpoint: ConsumerEndpoint,
  path: string,
  apiBaseUrl: string,
  body?: Record<string, unknown>,
): string {
  if (endpoint.group === 'events') {
    return [
      "import axios from 'axios'",
      '',
      'const res = await axios.get(' + `'${apiBaseUrl}${path}'` + ', {',
      "  headers: { 'x-api-key': process.env.WA_API_KEY! },",
      "  responseType: 'stream',",
      '})',
      '',
      "res.data.on('data', (chunk: Buffer) => process.stdout.write(chunk))",
    ].join('\n')
  }

  const method = endpoint.method.toLowerCase()
  const lines = [
    "import axios from 'axios'",
    '',
    'const api = axios.create({',
    `  baseURL: '${apiBaseUrl}',`,
    "  headers: { 'x-api-key': process.env.WA_API_KEY! },",
    '})',
    '',
  ]

  if (endpoint.method === 'DELETE') {
    lines.push(`const res = await api.delete('${path}')`)
    lines.push('if (res.status !== 204) throw new Error(`Hapus gagal: ${res.status}`)')
    return lines.join('\n')
  }

  const call = body
    ? `api.${method}('${path}', ${jsonLines(body, '')})`
    : `api.${method}('${path}')`
  lines.push(`const { data } = await ${call}`)
  return lines.join('\n')
}

function buildCurlSample(
  endpoint: ConsumerEndpoint,
  url: string,
  body?: Record<string, unknown>,
): string {
  if (endpoint.group === 'events') {
    return `curl -N '${url}' \\\n  -H "x-api-key: $WA_API_KEY"`
  }

  const lines: string[] = []
  if (endpoint.method === 'GET') {
    lines.push(`curl '${url}' \\`)
  } else {
    lines.push(`curl -X ${endpoint.method} '${url}' \\`)
  }
  if (body) {
    lines.push('  -H "x-api-key: $WA_API_KEY" \\')
    lines.push("  -H 'content-type: application/json' \\")
    lines.push(`  -d '${jsonLines(body, '  ')}'`)
  } else {
    lines.push('  -H "x-api-key: $WA_API_KEY"')
  }
  return lines.join('\n')
}

export function buildCodeSamples(endpoint: ConsumerEndpoint, apiBaseUrl: string): CodeSample[] {
  const example = ENDPOINT_EXAMPLES[endpointKey(endpoint)]
  const path = `${fillPath(endpoint.path)}${example?.query ?? ''}`
  const url = `${apiBaseUrl}${path}`

  return [
    {
      id: 'fetch',
      label: 'TypeScript fetch',
      code: buildFetchSample(endpoint, url, example?.body),
    },
    {
      id: 'axios',
      label: 'Node axios',
      code: buildAxiosSample(endpoint, path, apiBaseUrl, example?.body),
    },
    { id: 'curl', label: 'curl', code: buildCurlSample(endpoint, url, example?.body) },
  ]
}

export function endpointResponse(endpoint: ConsumerEndpoint): CodeSample | null {
  const example = ENDPOINT_EXAMPLES[endpointKey(endpoint)]
  if (!example) return null
  return { id: 'fetch', label: example.response.language, code: example.response.code }
}
