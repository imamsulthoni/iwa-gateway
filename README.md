# WA Bot Service

Monorepo layanan WhatsApp berbasis Baileys: API Hono, worker BullMQ, MySQL 8, Redis 7, dan dashboard React 19 + TanStack Router. Scaffold Fase 1 — tanpa pesan masuk, media, webhook, atau multi-tenant.

## Prasyarat

- Node.js 20+ (`.nvmrc` berisi `20`)
- pnpm 9+ (`corepack enable`)
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

- API: http://localhost:3000
- Web: http://localhost:5173/app
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
| `PORT`                | `3000`                                     | api                          |
| `DATABASE_URL`        | `mysql://wa:wa@localhost:3306/wa_bot`      | api, worker, drizzle, seed   |
| `DATABASE_URL_TEST`   | `mysql://wa:wa@localhost:3306/wa_bot_test` | test integrasi               |
| `REDIS_URL`           | `redis://localhost:6379`                   | api, worker                  |
| `AUTH_ENC_KEY`        | base64 32 byte                             | worker (enkripsi auth state) |
| `LOG_LEVEL`           | `info`                                     | api, worker                  |
| `APP_TIMEZONE`        | `Asia/Jakarta`                             | api, worker                  |
| `CORS_ORIGIN`         | `http://localhost:5173`                    | api                          |
| `BROWSER_NAME`        | `WA Bot Service`                           | worker                       |
| `SESSION_LOCK_TTL_MS` | `30000`                                    | worker                       |
| `RATE_LIMIT_PER_MIN`  | `60`                                       | api                          |
| `VITE_API_BASE_URL`   | `http://localhost:3000`                    | web                          |

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
