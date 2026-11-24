# WA Bot Console

Monorepo layanan WhatsApp berbasis Baileys: API Hono, worker BullMQ, MySQL 8, Redis 7, dan dashboard React 19 + TanStack Router. Mencakup pengelolaan nomor (QR/pairing code), pengiriman pesan teks, broadcast teks dengan jeda acak, batas harian, penjadwalan, serta pause/resume, inbox room chat per JID dengan SSE real-time, webhook keluar (HMAC + retry), opt-out global per nomor, riwayat pesan, dan statistik.

## Prasyarat

- Node.js 24 (`.nvmrc` berisi `24.22.1`)
- pnpm 12 (ter-pin di `packageManager`, aktifkan via `corepack enable`)
- Docker + Docker Compose

## Mulai dari clone bersih

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed:key   # simpan API key yang tampil sekali
pnpm dev
```

- API: http://localhost:8467
- Web: http://localhost:8468/app
- Login dashboard memakai API key dari `pnpm db:seed:key`.

`pnpm dev` menjalankan dua proses backend (`api` dan `worker`) plus Vite. Hentikan dengan `Ctrl+C`; kedua proses backend menutup koneksi dan socket lewat graceful shutdown.

## Script

| Script                  | Fungsi                                                    |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | API, worker, dan web mode watch                           |
| `pnpm build`            | Build backend (`dist/api.js`, `dist/worker.js`) dan web   |
| `pnpm lint`             | ESLint termasuk batas package/folder                      |
| `pnpm format`           | Prettier write                                            |
| `pnpm typecheck`        | TypeScript di tiga package                                |
| `pnpm test`             | Unit test Vitest                                          |
| `pnpm test:integration` | Test integrasi (butuh MySQL + Redis, `RUN_INTEGRATION=1`) |
| `pnpm db:generate`      | Generate migrasi Drizzle                                  |
| `pnpm db:migrate`       | Jalankan migrasi                                          |
| `pnpm db:studio`        | Drizzle Studio                                            |
| `pnpm db:seed:key`      | Buat API key admin                                        |

## Environment

Hanya ada satu file env: `.env` di root. Jangan membuat env di dalam `packages/`.

| Variabel                     | Contoh                                            | Dipakai                        |
| ---------------------------- | ------------------------------------------------- | ------------------------------ |
| `NODE_ENV`                   | `development`                                     | semua                          |
| `PORT`                       | `8467`                                            | api                            |
| `DATABASE_URL`               | `mysql://wbc:root@localhost:3306/wa_console`      | api, worker, drizzle, seed     |
| `DATABASE_URL_TEST`          | `mysql://wbc:root@localhost:3306/wa_console_test` | test integrasi                 |
| `REDIS_URL`                  | `redis://localhost:6379`                          | api, worker                    |
| `AUTH_ENC_KEY`               | base64 32 byte                                    | worker (enkripsi auth state)   |
| `LOG_LEVEL`                  | `info`                                            | api, worker                    |
| `APP_TIMEZONE`               | `Asia/Jakarta`                                    | api, worker                    |
| `CORS_ORIGIN`                | `http://localhost:8468` (boleh dipisah koma)      | api                            |
| `BROWSER_NAME`               | `WA Bot Console`                                  | worker                         |
| `SESSION_LOCK_TTL_MS`        | `30000`                                           | worker                         |
| `RATE_LIMIT_PER_MIN`         | `240`                                             | api                            |
| `BROADCAST_AUTO_PAUSE_RATIO` | `0.2`                                             | worker (auto-pause broadcast)  |
| `WEBHOOK_ALLOW_HTTP_PRIVATE` | `false`                                           | api (webhook ke IP privat)     |
| `LOG_DIR`                    | `logs` (opsional)                                 | api, worker (log JSON ke file) |
| `VITE_API_BASE_URL`          | `http://localhost:8467`                           | web                            |

Buat `AUTH_ENC_KEY` dengan `openssl rand -base64 32`. Hanya variabel `VITE_*` yang diekspos ke web.

## Batas dependensi

| Unit                  | Boleh import                                     | Dilarang                              |
| --------------------- | ------------------------------------------------ | ------------------------------------- |
| `shared`              | —                                                | semua package internal                |
| `backend`             | `shared`                                         | `web`                                 |
| `web`                 | `shared`                                         | `backend`                             |
| `backend/src/db`      | `shared`, `infra/load-env` (seed/drizzle config) | `api`, `worker`, `modules`, `baileys` |
| `backend/src/modules` | `shared`, `db`, `infra`, modul lain              | `api`, `worker`, `baileys`            |
| `backend/src/api`     | `modules`, `infra`, `db`, `shared`               | `worker`, `baileys`                   |
| `backend/src/worker`  | `modules`, `baileys`, `infra`, `db`, `shared`    | `api`                                 |
| `backend/src/baileys` | `modules`, `infra`, `db`                         | `api`, `worker`                       |

`web` hanya bicara lewat HTTP. `api` tidak membuka socket Baileys; pengiriman selalu lewat antrean. `worker` tidak mengimpor `src/api`, sehingga bundel worker bebas Hono.

## Dua proses di produksi

```bash
pnpm build
node packages/backend/dist/api.js
node packages/backend/dist/worker.js
```

Keduanya membaca environment container (bukan file `.env`). Worker memegang lock sesi dan socket; API menulis DB dan enqueue job. Jalankan sebagai dua service terpisah agar bisa diskalakan sendiri-sendiri.

### Rolling restart

1. Deploy versi baru worker satu instance pada satu waktu (bukan semua sekaligus).
2. Worker menerima `SIGTERM`/`SIGINT`: berhenti ambil job baru, drain antrean aktif, tutup socket, lepas lock (batas 10 detik).
3. Sesi yang lock-nya lepas diambil alih worker lain dalam satu siklus reconcile (15 detik) — tanpa scan QR ulang karena auth state ada di MySQL.
4. API bisa di-restart kapan saja; dashboard hanya kehilangan request in-flight.
5. Verifikasi pasca-restart: `GET /v1/health` harus `status: ok`, jumlah sesi terhubung kembali seperti sebelum restart, tidak ada pesan `queued` yang menggantung.

### TLS dan secret

- TLS diakhiri di reverse proxy di depan API (nginx/Caddy/ALB). API melayani HTTP plain hanya di jaringan internal.
- Secret (`AUTH_ENC_KEY`, `DATABASE_URL`, `REDIS_URL`) hanya dari environment/secret manager — tidak pernah masuk repo atau log.
- Auth state (creds + keys) terenkripsi AES-256-GCM di database. Backup database harus terenkripsi dan diuji restore-nya; sesi tetap terhubung setelah restore karena auth state dibaca ulang saat worker start.

### Log

Log ditulis sebagai JSON line ke stdout (tertangkap `docker logs`/journald). Set `LOG_DIR=logs` bila ingin salinan lokal: API menulis `logs/api.log`, worker menulis `logs/worker.log`. Secret tetap diredaksi (`creds`, `value`, `token`, `x-api-key`).

Berkas log tidak dirotasi aplikasi; serahkan ke logrotate:

```
logs/*.log {
  daily
  rotate 7
  compress
  missingok
  notifempty
  copytruncate
}
```

### Metrik

`GET /v1/health` (publik, tanpa API key) mengembalikan `status`, `checks`, dan `metrics`:

| Field                                          | Arti                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `inbound.processed` / `duplicates` / `nonText` | Pesan `notify` yang diproses, event ganda yang dibuang, dan pesan non-teks |
| `sse.activeConnections`                        | Koneksi SSE terbuka pada instance API yang menjawab                        |
| `webhooks.delivered` / `failed` / `retry`      | Hasil dispatch webhook sejak counter terakhir direset                      |
| `webhooks.pendingDue` / `outboxLagMs`          | Delivery jatuh tempo yang belum terkirim dan umur yang tertua              |
| `optOuts` / `broadcastsPaused`                 | Jumlah nomor opt-out dan broadcast berstatus `paused`                      |

`status` menjadi `degraded` bila database/Redis gagal atau `webhooks.outboxLagMs` melebihi 30 detik. Counter disimpan di hash Redis `wa:metrics` (bertahan saat proses restart) dan direset dengan `redis-cli DEL wa:metrics`; angka `optOuts`, `broadcastsPaused`, `pendingDue`, dan `outboxLagMs` dibaca langsung dari database.

## Dokumentasi API

Referensi interaktif: `GET /v1/openapi.json` (OpenAPI 3.1) dan `GET /v1/docs` (Scalar). Versi markdown untuk reviewer/integrator: [`API-CONTRACT.md`](./API-CONTRACT.md).

Auth: `x-api-key` (API key admin) untuk endpoint admin, atau `Authorization: Bearer <token login sales>` untuk sales (login nomor WhatsApp + PIN lewat `POST /v1/auth/login`). Endpoint pesan per sesi menerima API key, token login sales, atau `Authorization: Bearer <token sesi>`. Endpoint sales otomatis dibatasi ke sesi & inbox miliknya (403 di luar itu).

- Format error: `{ "error": { "code": "snake_case", "message": "..." } }`
- Pagination: `limit` (default 20, maksimum 100) + `cursor` opak → `{ "items": [...], "nextCursor": "..." }`
- Pekerjaan asinkron (kirim pesan, broadcast) → `202` + id dan status awal
- Kirim pesan hanya diterima bila sesi berstatus `connected`; selain itu `422` (replay `clientRef` lama tetap `200`)
- Semua waktu ISO-8601 UTC; "hari ini" memakai `APP_TIMEZONE`
- Rate limit per API key dan per sesi → `429` + `Retry-After`
- SSE memakai `fetch` streaming + header `x-api-key`, bukan `EventSource`

### Endpoint

| Method   | Endpoint                             | Fungsi                                                              |
| -------- | ------------------------------------ | ------------------------------------------------------------------- |
| `GET`    | `/v1/health`                         | Nama, versi, status dependensi, dan metrik                          |
| `GET`    | `/v1/openapi.json`                   | Dokumen OpenAPI 3.1                                                 |
| `GET`    | `/v1/docs`                           | Dokumentasi interaktif (Scalar)                                     |
| `POST`   | `/v1/auth/login`                     | Login sales (nomor WhatsApp + PIN), rate limit ketat                |
| `GET`    | `/v1/auth/me`                        | Identitas aktor: admin atau sales                                   |
| `POST`   | `/v1/auth/logout`                    | Cabut token login sales                                             |
| `GET`    | `/v1/settings`                       | `maxSales`, jumlah sales aktif, default delay (admin)               |
| `PATCH`  | `/v1/settings`                       | Ubah batas sales dan default delay broadcast (admin)                |
| `GET`    | `/v1/stats`                          | Sesi terhubung, pesan hari ini, total pesan, broadcast              |
| `GET`    | `/v1/sessions`                       | Daftar sesi (sales: hanya miliknya)                                 |
| `POST`   | `/v1/sessions`                       | Buat sesi + akun sales + token sekali tampil                        |
| `GET`    | `/v1/sessions/:id`                   | Detail sesi                                                         |
| `DELETE` | `/v1/sessions/:id`                   | Hapus sesi + auth state (cascade)                                   |
| `GET`    | `/v1/sessions/:id/status`            | Status ringkas sesi + label UI                                      |
| `GET`    | `/v1/sessions/:id/live`              | Gabungan state dashboard: sesi, QR, pairing, broadcast, delay       |
| `GET`    | `/v1/sessions/:id/qr`                | QR sebagai data-URL                                                 |
| `GET`    | `/v1/sessions/:id/pairing`           | Kode pairing terakhir                                               |
| `POST`   | `/v1/sessions/:id/pairing`           | Dinonaktifkan (pairing hanya lewat QR)                              |
| `POST`   | `/v1/sessions/:id/cancel`            | Batalkan proses pairing (admin atau sales pemilik sesi)             |
| `POST`   | `/v1/sessions/:id/login`             | Mulai koneksi (admin/sales pemilik); 409 bila sudah terhubung       |
| `POST`   | `/v1/sessions/:id/logout`            | Logout sesi dan hapus auth tersimpan                                |
| `POST`   | `/v1/sessions/:id/token`             | Rotasi token sesi (tampil sekali)                                   |
| `PATCH`  | `/v1/sessions/:id/sales`             | Tautkan akun sales ke sesi lama (admin)                             |
| `POST`   | `/v1/sessions/:id/sales/pin`         | Reset PIN sales + cabut token login lama (admin)                    |
| `POST`   | `/v1/sessions/:id/messages`          | Kirim pesan teks — API key, token sesi, atau token sales            |
| `GET`    | `/v1/sessions/:id/messages`          | Riwayat pesan per sesi — API key, token sesi, atau token sales      |
| `GET`    | `/v1/sessions/:id/broadcast/current` | Job broadcast berjalan/terakhir (admin atau sales pemilik sesi)     |
| `POST`   | `/v1/sessions/:id/broadcast/cancel`  | Batalkan broadcast berjalan (admin atau sales pemilik sesi)         |
| `GET`    | `/v1/messages`                       | Riwayat lintas sesi (`limit`, `sessionId`)                          |
| `DELETE` | `/v1/messages/:id`                   | Soft delete satu entri riwayat                                      |
| `POST`   | `/v1/messages/:id/retry`             | Kirim ulang pesan berstatus `failed`                                |
| `GET`    | `/v1/sessions/:id/events`            | Stream SSE: status sesi, QR, pesan masuk, status pesan              |
| `GET`    | `/v1/sessions/:id/conversations`     | Daftar room chat sesi, urut `lastMessageAt` terbaru (cursor)        |
| `GET`    | `/v1/conversations/:id/messages`     | Riwayat pesan satu room (cursor)                                    |
| `POST`   | `/v1/conversations/:id/read`         | Tandai room dibaca: reset unread dan status pesan masuk jadi `read` |
| `POST`   | `/v1/messages`                       | Kirim pesan teks (`sessionId`, `to`, `text`, `clientRef`)           |
| `POST`   | `/v1/broadcasts`                     | Broadcast teks, opsional `scheduledAt` (ISO-8601 UTC)               |
| `GET`    | `/v1/broadcasts/:id`                 | Status, progres, dan status per penerima                            |
| `POST`   | `/v1/broadcasts/:id/start`           | Mulai broadcast terjadwal atau lanjutkan yang dijeda                |
| `POST`   | `/v1/broadcasts/:id/pause`           | Jeda broadcast; penerima tersisa tetap `pending`                    |
| `GET`    | `/v1/webhooks`                       | Daftar endpoint webhook (tanpa secret)                              |
| `POST`   | `/v1/webhooks`                       | Daftarkan endpoint + event; secret tampil sekali                    |
| `PATCH`  | `/v1/webhooks/:id`                   | Ubah URL, event, atau status aktif                                  |
| `DELETE` | `/v1/webhooks/:id`                   | Hapus endpoint beserta log delivery                                 |
| `POST`   | `/v1/webhooks/:id/rotate-secret`     | Rotasi secret (tampil sekali)                                       |
| `GET`    | `/v1/webhooks/:id/deliveries`        | Log delivery (`limit`, `cursor`, filter `status`)                   |

`:id` sesi adalah `id` internal sesi (`wa_sessions.id`, UUID); `:id` conversation, broadcast, dan webhook juga UUID. `publicId` kini hanya label tampilan.

### Alur admin vs sales

- **Admin** masuk dengan API key. Admin membuat nomor sekaligus akun sales (nama, nomor WhatsApp, PIN), mengatur batas jumlah sales di Pengaturan, melihat semua nomor/riwayat, dan mengelola webhook.
- **Sales** masuk dengan nomor WhatsApp + PIN. Menu yang tersedia hanya Nomor dan Inbox; daftar nomor, detail, inbox, SSE, kirim pesan, broadcast, dan riwayat pesan dibatasi ke sesinya sendiri. Sales tidak bisa menambah, menghapus, pairing ulang, logout nomor, mereset PIN, atau mengirim ulang pesan gagal.
- Login gagal selalu `Nomor atau PIN salah`; nomor yang belum punya sesi membalas `NO_SESSION` (403). Reset PIN lewat detail nomor mencabut token login lama.
- Sesi lama (`owner_user_id` kosong) hanya bisa diakses admin sampai ditautkan lewat `PATCH /v1/sessions/:id/sales`.

### Webhook keluar

| Event                 | Kapan dikirim                                                     |
| --------------------- | ----------------------------------------------------------------- |
| `message.status`      | Status pesan keluar berubah.                                      |
| `message.received`    | Pesan masuk tersimpan.                                            |
| `session.status`      | Nomor terhubung, terputus, atau keluar.                           |
| `broadcast.recipient` | Satu penerima broadcast `sent`, `failed`, atau `skipped`.         |
| `broadcast.status`    | Broadcast terminal: `done`, `paused`, `failed`, atau `cancelled`. |

- URL wajib HTTPS; `http://` hanya diterima untuk `localhost`/loopback, atau ke IP privat (10/8, 172.16/12, 192.168/16) bila `WEBHOOK_ALLOW_HTTP_PRIVATE=true`. Secret 64 karakter hex dibuat server dan hanya muncul saat create/rotate.
- Header: `X-Event-Id` (id delivery, stabil antar retry) dan `X-Signature: sha256=<HMAC-SHA256(body, secret endpoint)>`.
- Timeout 10 detik, maksimal 3 percobaan (awal + 2 retry) dengan jeda 10 lalu 20 detik; setelah itu status `failed`. Balasan non-2xx dihitung gagal; delivery ke endpoint nonaktif langsung `failed`.
- Penerima sebaiknya idempoten berdasarkan `X-Event-Id`.
- `broadcast.recipient` juga idempoten lewat `(broadcast_id, recipient_id)`. `sent` berarti Baileys berhasil kirim, bukan `delivered`/`read`; sumber kebenaran status broadcast tetap `GET /v1/broadcasts/{id}`.

```json
{
  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f60",
  "type": "message.received",
  "session_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f61",
  "data": {
    "message_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",
    "conversation_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63",
    "from": "6281234567890@s.whatsapp.net",
    "type": "image",
    "body": "Gambar",
    "occurred_at": "2026-11-17T03:00:00.000Z"
  }
}
```

```json
{
  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f64",
  "type": "session.status",
  "session_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f61",
  "data": {
    "status": "connected",
    "phone_number": "6281234567890",
    "occurred_at": "2026-11-17T03:00:00.000Z"
  }
}
```

```bash
curl -X POST http://localhost:8467/v1/webhooks \
  -H "x-api-key: $API_KEY" \
  -H "content-type: application/json" \
  -d '{"url":"https://example.com/hook","events":["broadcast.recipient","broadcast.status"]}'
```

### SSE

Envelope mengikuti format SSE: `id`, `event`, `data` (JSON). Heartbeat komentar `: ping` dikirim setiap 15 detik; koneksi ditutup bila sesi dihapus.

```bash
curl -N -H "x-api-key: $API_KEY" http://localhost:8467/v1/sessions/<wa_sessions.id>/events
```

```text
id: 0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65
event: message.received
data: {"message":{"id":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62","conversationId":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63","sessionId":"0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f61","direction":"in","type":"text","body":"Halo","status":"delivered","clientRef":null,"waMessageId":"3EB0...","createdAt":"2026-11-17T03:00:00.000Z"}}
```

Event yang mungkin: `session.status`, `session.qr`, `message.received`, `message.status`. Bentuk data mengikuti kontrak zod di `packages/shared/src/contracts/event.ts`.

## Verifikasi

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Test integrasi memakai `DATABASE_URL_TEST` dan dijalankan opt-in:

```bash
RUN_INTEGRATION=1 pnpm test:integration
```

## Struktur singkat

```
packages/shared    kontrak zod, konstanta status/limit, kode error
packages/backend   api, worker, baileys, modules, db, infra
packages/web       dashboard React + TanStack Router (base /app)
```
