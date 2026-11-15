# Changelog

Semua perubahan penting pada proyek ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
