# Changelog

Semua perubahan penting pada proyek ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Fase 2 (F2-M0 sampai F2-M3): inbox/room chat, SSE, webhook, opt-out, dan broadcast lanjutan. Versi paket masih `0.1.0`; rilis Fase 2 baru ditandai setelah F2-M4 (T9) selesai.

### Added

- Autentikasi admin/sales: `users`, `user_sessions` (token opaque 7 hari, disimpan sebagai hash), login nomor WhatsApp + PIN (`POST /v1/auth/login`, scrypt + salt), `/v1/auth/me`, `/v1/auth/logout`, rate limit 5 percobaan / 5 menit per IP dan nomor.
- Otorisasi per role: API key admin atau Bearer sales, scoping sesi/inbox/SSE, `GET /v1/sessions` difilter owner, endpoint admin menolak sales `403`.
- Pengaturan server-side `max_sales` (`GET`/`PATCH /v1/settings`, fallback 10) dan pembuatan akun sales bersama sesi dalam satu transaksi.
- `salesName` pada `SessionDto` dan riwayat pesan lintas sesi; UI sales read-only untuk Nomor/Inbox, guard halaman admin, dan kartu batas sales.
- Reset PIN sales (`POST /v1/sessions/{id}/sales/pin`) dan penautan akun sales ke sesi lama (`PATCH /v1/sessions/{id}/sales`).
- Inbox dan room chat per JID: pesan masuk `notify` (teks dan label non-teks seperti `image`/`document`) tersimpan idempoten lewat `(session_id, wa_message_id)`, percakapan di-upsert dengan LID kanonis + PN alternatif, unread count, dan `POST /v1/conversations/:id/read`.
- SSE `GET /v1/sessions/:id/events` lewat Redis pub/sub dengan envelope `id`/`event`/`data`, heartbeat 15 detik, dan auth `x-api-key` melalui `fetch` streaming.
- Webhook keluar: CRUD endpoint, secret sekali tampil + rotasi, outbox `webhook_deliveries`, dispatcher `SELECT ... FOR UPDATE SKIP LOCKED`, HMAC `sha256=`, `X-Event-Id` stabil, timeout 10 detik, retry 3 percobaan (jeda 10 lalu 20 detik), dan log delivery.
- Opt-out global per nomor lewat kata kunci `STOP`/`BERHENTI`/`UNSUBSCRIBE` (case-insensitive); penerima opt-out ditandai `skipped` saat broadcast dan tidak dihitung ke batas harian.
- Broadcast terjadwal (`scheduledAt`), kendali `start`/`pause` tanpa duplikasi, auto-pause saat rasio gagal melewati `BROADCAST_AUTO_PAUSE_RATIO` setelah minimal 20 penerima, dan alasan jeda di API.
- UI: halaman inbox, pengaturan webhook, serta jadwal dan kendali broadcast.
- Metrik operasional di `GET /` (pesan masuk diproses/duplikat/non-teks, koneksi SSE aktif, webhook delivered/failed/retry, outbox lag, opt-out, broadcast paused) dan `status: degraded` saat outbox tertinggal atau dependensi mati.
- Log JSON opsional ke file lokal lewat `LOG_DIR` (`logs/api.log`, `logs/worker.log`) tanpa mengubah format stdout.

### Changed

- Breaking change: field idempotensi `referenceId` menjadi `clientRef` pada API pesan dan broadcast (kolom `reference_id` di-rename menjadi `client_ref`, data lama tetap terbaca).
- Skema target 12 tabel: `conversations`, `opt_outs`, `webhook_endpoints`, `webhook_deliveries`; `broadcasts.template` → `text`; status broadcast/recipient diperluas.
- Breaking change: semua endpoint API kini berprefix `/v1` (termasuk sesi, pesan, stats, settings, auth); endpoint infra `/`, `/openapi.json`, dan `/docs` tetap tanpa prefix. Path lama tanpa `/v1` dihapus, tanpa alias.

### Security

- Secret webhook tidak pernah dikembalikan pada list/update, hanya saat create/rotate; header `X-Signature` memakai HMAC-SHA256 body.
- URL webhook wajib HTTPS (loopback hanya untuk uji lokal) dan endpoint `/v1` memakai rate limit per API key.
- PIN sales hanya diterima di body `POST /v1/auth/login` dan endpoint admin; disimpan sebagai hash scrypt dan tidak pernah masuk response/log. Token login dan token sesi disimpan sebagai hash; logout/reset PIN mencabut token lama.
- Sales tidak bisa mengakses data sales lain (`403`), termasuk sesi, inbox, SSE, riwayat lintas sesi, webhook, dan settings.

### Migrasi

- Migrasi `0003` menambah tabel `users`, `user_sessions`, `app_settings`, dan kolom `wa_sessions.owner_user_id` (FK `users.id` on delete set null + unique index satu sesi per sales). Data Fase 1 tetap terbaca dengan `owner_user_id = NULL` dan hanya bisa diakses admin; tidak ada backfill otomatis. Jalankan `pnpm db:migrate` setelah backup; rollback Drizzle dilakukan dengan restore backup, atau manual: drop `user_sessions`, `users`, `app_settings` lalu kolom/index `owner_user_id`.

### Migrasi

- Tiga migrasi Drizzle (`0000`–`0002`) menjalankan rename `client_ref`, kolom `conversations`/`messages.conversation_id`, `opt_outs`, `webhook_*`, dan kolom `wa_sessions.engine`/`auth_format`/`pairing_method`. Jalankan `pnpm db:migrate` setelah backup; Drizzle tidak menyediakan down migration, sehingga rollback dilakukan dengan restore backup.

## [0.1.0] - 2026-11-15

Fase 1: fondasi, sesi multi-nomor, kirim pesan, broadcast, dashboard.

### Added

- Monorepo pnpm (`shared`, `backend`, `web`) dengan TypeScript strict, ESLint batas dependensi antar package/folder, dan env terpusat satu `.env`.
- Skema Fase 1 (8 tabel tanpa `tenant_id`): `api_keys`, `wa_sessions`, `wa_auth_creds`, `wa_auth_keys`, `messages`, `message_status_events`, `broadcasts`, `broadcast_recipients`; collation `utf8mb4_bin` pada `wa_auth_keys.key_id`.
- Auth state Baileys di MySQL (`useDbAuthState`): transaksional, terenkripsi AES-256-GCM, cache signal key dengan invalidasi saat `clear()`/401; deteksi creds/keys tidak konsisten → sesi `logged_out` dan auth dihapus.
- Lock sesi Redis berTTL dengan renewal berkala; socket dihentikan saat lock hilang.
- Session manager worker: bootstrap sesi dari DB, reconnect backoff non-401, 401 → hapus auth + `logged_out`; reconcile menghentikan socket sesi yang dihapus/logout.
- Konfigurasi socket terpusat: `markOnlineOnConnect: false`, `syncFullHistory: false`, `shouldIgnoreJid` grup/broadcast/newsletter, `msgRetryCounterCache` di luar start, `getMessage` dari kolom `raw`.
- Alur QR (data-URL) dan pairing code (dipicu dari event `qr`, hanya saat belum `registered`).
- Kirim pesan teks dengan idempotensi `referenceId`, validasi penerima via `onWhatsApp` (cache 60 detik), status `sent/delivered/read/failed` dari `messages.update` dengan riwayat status.
- Broadcast teks: penerima manual, jeda acak 10–600 detik, batas harian per nomor (default 200, `APP_TIMEZONE`), kontrol mulai/batal, progres per penerima.
- API Fase 1 tanpa prefiks `/v1`: auth API key admin + token per sesi (rotasi), rate limit per key dan per sesi (429 + `Retry-After`), format error `{error:{code,message}}`, pagination cursor.
- Health endpoint `GET /` dengan pengecekan database dan redis (`ok`/`degraded`).
- Dashboard React (`/app`): login API key, ringkasan, kelola nomor, detail sesi (koneksi/kirim/broadcast/riwayat), riwayat lintas sesi, pengaturan delay broadcast di localStorage.
- CLI seed API key admin (hash SHA-256, plaintext sekali tampil, pencabutan via `revoked_at`).

### Security

- API key dan token sesi disimpan sebagai hash SHA-256; token sesi hanya tampil sekali.
- Isi auth state tidak pernah tercatat di log (redaksi pino).
- Endpoint pesan menerima API key admin atau token sesi milik sesi tersebut.
