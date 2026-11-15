# AGENTS.md

Aturan wajib untuk agent coding (OpenCode, Claude Code, Cursor, dll.) yang bekerja di repo ini. Patuhi tanpa diminta.

## Sumber kebenaran

- `docs/` berisi PRD, skema database, ui-mapping, dan breakdown task. Baca sebelum mengerjakan fitur.
- Folder `docs/` sengaja di-gitignore — tetap local-only, jangan pernah di-commit.
- `README.md` berisi perintah dan aturan dependensi yang ringkas.

## Task & checklist

- Breakdown task ada di `docs/tasks-scaffold.md`, `docs/tasks-fase-1.md`, `docs/tasks-fase-2.md` dengan ID `T<milestone>.<nomor>`.
- **Setiap task yang selesai WAJIB dicentang** di file markdown-nya: ubah `- [ ]` menjadi `- [x]` pada baris task tersebut, di commit yang sama dengan perubahan kodenya.
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

| Unit | Boleh import | Dilarang |
| --- | --- | --- |
| `shared` | — | semua package internal |
| `backend` | `shared` | `web` |
| `web` | `shared` | `backend` (web hanya bicara HTTP) |
| `backend/src/db` | `shared`, `infra/load-env` | `api`, `worker`, `modules`, `baileys` |
| `backend/src/modules` | `shared`, `db`, `infra`, modul lain | `api`, `worker`, `baileys` |
| `backend/src/api` | `modules`, `infra`, `db`, `shared` | `worker`, `baileys` |
| `backend/src/worker` | `modules`, `baileys`, `infra`, `db`, `shared` | `api` |
| `backend/src/baileys` | `modules`, `infra`, `db` | `api`, `worker` |

## Tooling & versi

- Node versi mengikuti `.nvmrc` (saat ini `24.22.1`); pnpm ter-pin di `packageManager` — jangan naikkan versi tanpa diminta.
- Gunakan perintah dari `package.json` (`pnpm dev`, `pnpm test`, `pnpm db:*`). Jangan menambah dependensi baru tanpa konfirmasi.

## Commit

- Konvensi: `<type>: <pesan singkat>` — bahasa Inggris, singkat dan simpel; body boleh untuk konteks.
- Type umum: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.
- Satu commit satu tujuan. Jangan campur perubahan tak terkait.
- Dilarang memodifikasi `.env`, secret, atau konfigurasi produksi tanpa konfirmasi eksplisit.
