# WA Bot Service

Monorepo layanan WhatsApp berbasis Baileys: API Hono, worker BullMQ, MySQL 8, Redis 7, dan dashboard React 19 + TanStack Router. **Fase 1** — kelola nomor (QR/pairing code), kirim pesan teks, broadcast teks dengan jeda acak dan batas harian, riwayat pesan keluar, dan statistik. Tanpa pesan masuk, media, webhook, atau multi-tenant.

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

| Variabel              | Contoh                                     | Dipakai                      |
| --------------------- | ------------------------------------------ | ---------------------------- |
| `NODE_ENV`            | `development`                              | semua                        |
| `PORT`                | `8467`                                     | api                          |
| `DATABASE_URL`        | `mysql://wa:wa@localhost:3306/wa_bot`      | api, worker, drizzle, seed   |
| `DATABASE_URL_TEST`   | `mysql://wa:wa@localhost:3306/wa_bot_test` | test integrasi               |
| `REDIS_URL`           | `redis://localhost:6379`                   | api, worker                  |
| `AUTH_ENC_KEY`        | base64 32 byte                             | worker (enkripsi auth state) |
| `LOG_LEVEL`           | `info`                                     | api, worker                  |
| `APP_TIMEZONE`        | `Asia/Jakarta`                             | api, worker                  |
| `CORS_ORIGIN`         | `http://localhost:8468`                    | api                          |
| `BROWSER_NAME`        | `WA Bot Service`                           | worker                       |
| `SESSION_LOCK_TTL_MS` | `30000`                                    | worker                       |
| `RATE_LIMIT_PER_MIN`  | `240`                                       | api                          |
| `VITE_API_BASE_URL`   | `http://localhost:8467`                    | web                          |

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
5. Verifikasi pasca-restart: `GET /` harus `status: ok`, jumlah sesi terhubung kembali seperti sebelum restart, tidak ada pesan `queued` yang menggantung.

### TLS dan secret

- TLS diakhiri di reverse proxy di depan API (nginx/Caddy/ALB). API melayani HTTP plain hanya di jaringan internal.
- Secret (`AUTH_ENC_KEY`, `DATABASE_URL`, `REDIS_URL`) hanya dari environment/secret manager — tidak pernah masuk repo atau log.
- Auth state (creds + keys) terenkripsi AES-256-GCM di database. Backup database harus terenkripsi dan diuji restore-nya; sesi tetap terhubung setelah restore karena auth state dibaca ulang saat worker start.

## Dokumentasi API

Kontrak lengkap (skema request/response, contoh, kode error): [`API-CONTRACT.md`](./API-CONTRACT.md).

Auth: header `x-api-key` (API key admin) untuk semua endpoint, kecuali dua endpoint pesan per sesi yang juga menerima `Authorization: Bearer <token sesi>`.

- Format error: `{ "error": { "code": "snake_case", "message": "..." } }`
- Pagination: `limit` (default 20, maksimum 100) + `cursor` opak → `{ "items": [...], "nextCursor": "..." }`
- Pekerjaan asinkron (kirim pesan, broadcast) → `202` + id dan status awal
- Semua waktu ISO-8601 UTC; "hari ini" memakai `APP_TIMEZONE`

| Endpoint                              | Fungsi                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| `GET /`                               | Nama, versi, status dependensi (database, redis)          |
| `GET /stats`                          | Sesi terhubung, pesan hari ini, total pesan, broadcast    |
| `GET /sessions`                       | Daftar sesi                                               |
| `POST /sessions`                      | Buat sesi (mode `qr`/`pairing`) + token sekali tampil     |
| `GET /sessions/:id`                   | Detail sesi                                               |
| `GET /sessions/:id/status`            | Status internal + label UI + sales/agent                  |
| `GET /sessions/:id/qr`                | QR sebagai data-URL                                       |
| `GET /sessions/:id/live`              | Gabungan sesi + QR + pairing code + broadcast (dashboard) |
| `GET /sessions/:id/pairing`           | Kode pairing                                              |
| `POST /sessions/:id/pairing`          | Minta kode pairing untuk nomor                            |
| `POST /sessions/:id/login`            | Login ulang setelah `logged_out`                          |
| `POST /sessions/:id/cancel`           | Batalkan pairing yang sedang berjalan                     |
| `POST /sessions/:id/token`            | Rotasi token sesi (tampil sekali)                         |
| `POST /sessions/:id/logout`           | Logout sesi                                               |
| `DELETE /sessions/:id`                | Hapus sesi + auth state (cascade)                         |
| `POST /sessions/:id/messages`         | Kirim pesan teks — admin key atau token sesi              |
| `GET /sessions/:id/messages`          | Riwayat pesan keluar per sesi (`limit`, `cursor`)         |
| `POST /sessions/:id/broadcast`        | Buat dan mulai broadcast                                  |
| `GET /sessions/:id/broadcast/current` | Job broadcast berjalan/terakhir                           |
| `POST /sessions/:id/broadcast/cancel` | Batalkan broadcast berjalan                               |
| `GET /messages`                       | Riwayat lintas sesi (`limit`, `sessionId`)                |
| `DELETE /messages/:id`                | Soft delete satu entri riwayat                            |

`:id` adalah `session.id` (UUID v7) dari response, bukan `publicId`. `publicId` hanya slug 1–32 karakter `[A-Za-z0-9_-]` untuk tampilan.

### Checklist non-goal Fase 1

Fitur berikut sengaja TIDAK ada di Fase 1 dan tidak boleh ikut ter-commit:

- [ ] Pesan masuk, room chat, kontak, opt-out
- [ ] Webhook keluar (`webhook_endpoints`, `webhook_deliveries`)
- [ ] Login user, role, JWT dashboard
- [ ] Media (gambar, dokumen, audio) dan template variabel
- [ ] Chat grup, channel, status/stories, panggilan
- [ ] Chatbot / auto-reply
- [ ] Adapter Cloud API resmi
- [ ] Pesan interaktif (tombol, list)
- [ ] Tenant / `tenant_id` di skema mana pun

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
