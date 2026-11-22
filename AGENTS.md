# AGENTS.md

Aturan wajib untuk agent coding (OpenCode, Claude Code, Cursor, dll.) yang bekerja di repo ini. Patuhi tanpa diminta.

## Sumber kebenaran

- Aturan di file ini dan `README.md` berlaku untuk semua orang, termasuk yang clone tanpa folder `docs/`.
- `docs/` (PRD, skema database, ui-mapping, breakdown task) hanya ada di mesin pemilik repo — sengaja di-gitignore, jangan pernah di-commit.
- Jika `docs/` ada, baca sebelum mengerjakan fitur. Jika tidak ada, kerjakan sesuai aturan di sini dan konfirmasi detail PRD ke pemilik repo.

## Struktur folder

- `packages/shared/src` — kontrak lintas package: `contracts/` (tipe/skema request-response), `constants/` (konstanta + limit).
- `packages/backend/src` — layanan backend, dipisah per folder:
  - `api/` — entry HTTP Hono; route per resource di `api/routes/<resource>.ts`, middleware di `api/middleware/`.
  - `worker/` — entry worker BullMQ; processor per job di `worker/processors/<job>.ts`, handler event di `worker/events/`.
  - `modules/<nama>/` — logika bisnis per domain (`auth`, `sessions`, `messages`, `broadcasts`, `stats`); satu modul berisi `repository.ts`, `service.ts`, dan test colocated.
  - `db/` — koneksi, `schema.ts` (Drizzle), seed di `db/seed/`; migrasi di `packages/backend/drizzle/`.
  - `baileys/` — wrapper WhatsApp: socket, JID, auth store.
  - `infra/` — infrastruktur lintas folder: `env.ts`, `load-env.ts`, `logger.ts`, `queue.ts`, `redis.ts`, `crypto.ts`, `lock.ts`.
  - `test/integration/` — test integrasi opt-in (butuh MySQL + Redis).
- `packages/web/src` — dashboard React + TanStack Router:
  - `routes/` — file-based routing; halaman terproteksi di `routes/_auth/`.
  - `components/` — komponen aplikasi; `design-system/` — primitif UI (Button, Card, Badge, dst).
  - `lib/` — helper (api client, auth, format, env); test colocated `*.test.ts`.
- Test unit diletakkan colocated di samping file yang diuji (`service.test.ts` di folder yang sama). Jangan buat folder `__tests__` baru.

## Konvensi penulisan kode

- TypeScript strict, ESM (`type: module`, `NodeNext`). Tidak ada `console.log` sisa debug di `src/`.
- Named exports saja — tidak ada `export default` di `backend` dan `shared`.
- Service mengikuti pola factory: `export function create<Nama>Service(repo)` plus `export type <Nama>Service = ReturnType<typeof create<Nama>Service>`.
- Dependenksi dikelompokkan: package internal workspace (`@wbc/*`) dan package eksternal lebih dulu, import relatif sesudahnya, dipisah baris kosong — biarkan ESLint/prettier yang memformat.
- Penamaan file: kebab-case untuk util/route (`auth-store.ts`, `add-session-dialog.tsx`), factory mengikuti nama domain.
- Error domain lewat modul `modules/errors.ts`; jangan lempar `Error` generik dari service.

## Task & checklist

- Breakdown task ada di `docs/tasks-scaffold.md`, `docs/tasks-fase-1.md`, `docs/tasks-fase-2.md` dengan ID `T<milestone>.<nomor>` — hanya relevan jika foldernya ada (mesin pemilik repo).
- **Setiap task yang selesai WAJIB dicentang** di file markdown-nya: ubah `- [ ]` menjadi `- [x]` pada baris task tersebut, di commit yang sama dengan perubahan kodenya. Lewati langkah ini jika file breakdown tidak ada.
- Jangan mengerjakan task lain di luar scope yang diminta. Jangan implementasi fitur fase berikutnya.
- Definition of Done setiap task: `pnpm lint && pnpm typecheck && pnpm test` hijau, tanpa `console.log` sisa debug, tanpa secret masuk repo.

## Verifikasi

- Sebelum mengklaim selesai: jalankan `pnpm lint && pnpm typecheck && pnpm test` dari root. Tambahkan `pnpm build` jika menyentuh build/dependensi.
- Jangan pernah bilang "seharusnya jalan" — buktikan dengan menjalankan.

## Environment & secret

- Hanya ada satu `.env` di root (salin dari `.env.example`). Dilarang membuat file `.env*` di dalam `packages/`.
- Hanya variabel berprefiks `VITE_*` yang boleh dibaca kode web.
- Jangan commit `.env`, kredensial, token, atau isi `docs/`.

## Batas dependensi antar package

| Unit                  | Boleh import                                  | Dilarang                              |
| --------------------- | --------------------------------------------- | ------------------------------------- |
| `shared`              | —                                             | semua package internal                |
| `backend`             | `shared`                                      | `web`                                 |
| `web`                 | `shared`                                      | `backend` (web hanya bicara HTTP)     |
| `backend/src/db`      | `shared`, `infra/load-env`                    | `api`, `worker`, `modules`, `baileys` |
| `backend/src/modules` | `shared`, `db`, `infra`, modul lain           | `api`, `worker`, `baileys`            |
| `backend/src/api`     | `modules`, `infra`, `db`, `shared`            | `worker`, `baileys`                   |
| `backend/src/worker`  | `modules`, `baileys`, `infra`, `db`, `shared` | `api`                                 |
| `backend/src/baileys` | `modules`, `infra`, `db`                      | `api`, `worker`                       |

## Tooling & versi

- Node versi mengikuti `.nvmrc` (saat ini `24.22.1`); pnpm ter-pin di `packageManager` — jangan naikkan versi tanpa diminta.
- Gunakan perintah dari `package.json` (`pnpm dev`, `pnpm test`, `pnpm db:*`). Jangan menambah dependensi baru tanpa konfirmasi.

## Commit

- Konvensi: `<type>: <pesan singkat>` — bahasa Inggris, singkat dan simpel; body boleh untuk konteks.
- Type umum: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Satu commit satu tujuan. Jangan campur perubahan tak terkait.
- Dilarang memodifikasi `.env`, secret, atau konfigurasi produksi tanpa konfirmasi eksplisit.
