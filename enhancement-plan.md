# Enhancement Plan — phone_number QR pairing + Pembersihan auth + Dokumentasi API (Hono Scalar)

Status: §1–§7 selesai (2026-11-16); §8 belum dikerjakan
Scope & urutan pengerjaan:
- Bagian A (§1–§6) → `packages/backend` (worker) + test colocated.
- Bagian B (§7) → `packages/backend/src/worker/reconcile.ts` + test colocated.
- Bagian C (§8, terakhir) → `packages/backend/src/api` + `packages/backend/package.json`.

## 1. Masalah

Setelah pairing via **scan QR** berhasil, baris di `wa_sessions` tetap punya
`phone_number = NULL`.

Bukti dari kode saat ini:

- `packages/backend/src/db/schema.ts:47` — `phoneNumber: varchar('phone_number', { length: 32 })` (nullable, unique index `wa_sessions_phone_uq` di baris 65).
- `packages/backend/src/worker/session-manager.ts:143-150` — handler `event.kind === 'open'` hanya update `status`, `lastQr`, `lastConnectedAt`.
- `packages/backend/src/worker/session-manager.ts:204-223` — `maybeRequestPairingCode()` satu-satunya tempat yang menulis `phoneNumber`, dan hanya jalan jika ada key Redis `wa:pairing:request:<sessionId>` (alur pairing **code**, bukan QR).
- Tidak ada kode yang membaca `creds.me?.id` (grep: hanya `creds.registered` dipakai).

Akibat: mode QR → tidak ada `wa:pairing:request:*` → `maybeRequestPairingCode` return lebih awal di baris 211 → kolom tetap `NULL`.

## 2. Tujuan

Saat koneksi pertama kali `open` (pairing QR maupun setelah restore creds), nomor
WhatsApp sesi terisi otomatis dari creds — tanpa mengganggu alur pairing code
yang sudah ada.

Non-tujuan (out of scope, kecuali disetujui):

- Backfill baris lama yang `phone_number`-nya sudah `NULL`.
- Perubahan schema/migrasi (kolom tetap nullable).
- Perubahan UI dashboard.

## 3. Rancangan perubahan

### 3.1 Helper normalisasi JID → nomor

File: `packages/backend/src/worker/session-manager.ts` (helper lokal, tidak diekspor)

```ts
// "628123456789:12@s.whatsapp.net" -> "628123456789"
function phoneFromCreds(meId: string | undefined): string | undefined {
  const user = meId?.split('@')[0]?.split(':')[0]
  return user || undefined
}
```

Alternatif: reuse `phoneFromJid()` di `packages/backend/src/modules/messages/phone.ts:25`.
Keputusan: helper lokal dipakai agar `worker` tidak menambah ketergantungan ke
modul `messages` hanya untuk hal ini (aturan dependensi tetap sah, tapi coupling
tidak perlu).

### 3.2 Handler `open`

File: `packages/backend/src/worker/session-manager.ts:143-150`

Perubahan: setelah update status koneksi, isi nomor secara **best effort**:

```ts
if (event.kind === 'open') {
  this.reconnectAttempts.delete(sessionId)
  await this.deps.sessions.update(sessionId, {
    status: 'connected',
    lastQr: null,
    lastConnectedAt: new Date(),
  })
  await this.syncPhoneNumber(sessionId, handle, session)
  return
}
```

Method baru:

```ts
private async syncPhoneNumber(
  sessionId: string,
  handle: SessionHandle,
  session: WaSessionRow,
): Promise<void> {
  if (session.phoneNumber) return          // jangan timpa data yang sudah ada
  const phoneNumber = phoneFromCreds(handle.auth.state.creds.me?.id)
  if (!phoneNumber) return
  try {
    await this.deps.sessions.update(sessionId, { phoneNumber })
  } catch (error) {
    // unique index wa_sessions_phone_uq: nomor bisa sudah dipakai sesi lain
    this.deps.logger.warn({ sessionId, err: error }, 'Gagal menyimpan nomor sesi')
  }
}
```

Alasan desain:

- **Dipisah dari update status**: kalau update nomor gagal (duplicate key), status
  `connected` tetap tersimpan dan socket tidak ikut gagal.
- **Guard `session.phoneNumber`**: alur pairing code sudah menulis nomor lebih awal
  (`status: 'connecting'`); jangan timpa, hindari risiko format berbeda.
- **`creds.me`** sudah tersedia di handle (`DbAuthState`) tanpa tambahan query.

### 3.3 Test

File: `packages/backend/src/worker/session-manager.test.ts`

Tambah 3 case (pakai pola `createManager()` + `state.handlers['connection.update']`):

1. `open` dengan `creds.me.id` terisi & `session.phoneNumber` null → `sessions.update`
   dipanggil dengan `{ phoneNumber: '628123456789' }` (JID `628123456789:12@s.whatsapp.net`).
2. `open` saat `session.phoneNumber` sudah terisi → tidak ada update `phoneNumber`.
3. `sessions.update` untuk `phoneNumber` reject (simulasi duplicate) → tidak throw,
   `logger.warn` terpanggil, status `connected` tetap terkirim.

Perlu penyesuaian fixture: `SESSION`/`createManager` saat ini default `phoneNumber: null`
(baris 50) — pastikan creds `me` diisi per-test agar tidak memengaruhi test lain.

## 4. Verifikasi

- `pnpm lint && pnpm typecheck && pnpm test` dari root (wajib hijau).
- Manual:
  1. Hapus/buat sesi baru dengan mode QR.
  2. Scan QR sampai dashboard menunjukkan `connected`.
  3. Cek `SELECT id, phone_number, status FROM wa_sessions WHERE id = '<id>';` → terisi.
  4. Pairing code tetap mengisi nomor seperti sebelumnya (regresi).

## 5. Risiko

| Risiko | Mitigasi |
| --- | --- |
| Nomor sama sudah dipakai sesi lain (unique index) | catch + `logger.warn`, koneksi tetap jalan |
| `creds.me` belum ada saat event `open` | guard `if (!phoneNumber) return` |
| Format berbeda dengan input pairing code (mis. `08...` vs `62...`) | tidak menimpa nilai yang sudah ada |

## 6. Checklist task

- [x] Tambah helper `phoneFromCreds`
- [x] Tambah `syncPhoneNumber` + panggil dari handler `open`
- [x] Tambah 3 unit test di `session-manager.test.ts`
- [x] Jalankan `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Verifikasi manual pairing QR

## 7. Plan tambahan — Pembersihan auth sesi `logged_out` yang tertinggal

Status: draft
Dependensi baru: tidak ada

### 7.1 Masalah

Alur logout (`POST /sessions/:id/logout`, `api/routes/sessions.ts:78-82`) bekerja lewat
pub/sub Redis: API menandai `wa_sessions.status = 'logged_out'`, lalu worker menerima
perintah `stop` + `clearAuth: true` dan menghapus auth (`worker/session-manager.ts:274-301`
→ `baileys/auth-store.ts:84-89`).

Dua kondisi membuat auth tidak terhapus:

1. **Worker mati saat publish** — pub/sub tidak persisten, pesan hilang. Status di DB
   sudah `logged_out`, tapi `wa_auth_creds` + `wa_auth_keys` masih ada sampai worker
   restart (`worker/bootstrap.ts:31-36`).
2. **Worker hidup tapi socket sesi tidak ada di memori** — `stop()` langsung `return`
   (`session-manager.ts:275-276`), jadi blok `clearAuth` tidak pernah dieksekusi.
   `reconcileSessions()` juga tidak menanganinya: `listStartable()` mengecualikan
   `logged_out` (`modules/sessions/repository.ts:60-69`), dan loop pembersihan hanya
   menyentuh sesi yang socket-nya aktif (`worker/reconcile.ts:49-61`).

Akibat: baris auth yatim menumpuk (terutama `wa_auth_keys` yang bisa ribuan baris per
sesi) sampai worker restart berikutnya.

### 7.2 Tujuan

Auth sesi `logged_out` terhapus dalam hitungan detik tanpa bergantung pada pesan
pub/sub, menggunakan mekanisme yang sudah ada (`reconcileSessions()` tiap 15 detik,
`worker/index.ts:90-94`).

Non-tujuan:

- Menutup celah perangkat yang tetap tertaut di sisi WhatsApp bila worker mati sebelum
  `socket.logout()` — butuh unlink manual dari HP, tidak bisa diselesaikan dari DB.
- Menghapus `wa_sessions` (baris sesi tetap ada sebagai riwayat status).

### 7.3 Rancangan perubahan

**File: `packages/backend/src/worker/reconcile.ts`**

Tambahkan sweep setelah loop ke-2 (baris 49-61), karena loop itu yang lebih dulu
menghentikan socket aktif lewat jalur normal (`manager.stop(id, true)`):

```ts
// Auth sesi logged_out yang tertinggal (pub/sub hilang / worker mati) dibersihkan di sini.
for (const row of await sessions.listByStatus('logged_out')) {
  if (await hasAuthState(db, row.id)) await deleteAuthState(db, row.id)
}
```

- Tambah import `deleteAuthState` (sudah satu file dengan `hasAuthState`).
- Loop ini identik dengan `bootstrap.ts:31-36`. Biarkan duplikat 4 baris; jangan
  menambah abstraksi baru hanya untuk ini.
- Key Redis pairing (`wa:pairing:request|code:*`) tidak perlu ditangani — sudah
  di-set `EX 600` sehingga kedaluwarsa sendiri.
- Tidak ada perubahan di API, `stop()`, atau schema.
- Tidak ada race dengan `socket.logout()`: sweep hanya menyentuh sesi yang socket-nya
  sudah tidak aktif (socket aktif ditangani lebih dulu oleh loop ke-2).

### 7.4 Test

File: `packages/backend/src/worker/reconcile.test.ts`

1. Row `logged_out` + `hasAuthState` true → `deleteAuthState` dipanggil sekali dengan
   `(db, 's1')`.
2. Row `logged_out` tanpa auth → `deleteAuthState` tidak dipanggil.
3. `deleteAuthState` reject → `logger.warn` terpanggil dan sesi lain tetap diproses.
4. Regresi: sesi `logged_out` tidak pernah masuk `manager.start` (tetap seperti test
   yang ada di `reconcile.test.ts:94-100`).

Penyesuaian fixture wajib (kalau tidak, semua test lama gagal):

- `state` hoisted (baris 5-9) tambah `deleteAuthState: vi.fn()`; factory
  `vi.mock('../baileys/auth-store.js')` (baris 11-15) tambah `deleteAuthState`.
- Stub `sessions` di `createDeps()` (baris 39-42) tambah
  `listByStatus: vi.fn(async () => [])`.

### 7.5 Risiko

| Risiko | Mitigasi |
| --- | --- |
| Menghapus auth sesi yang sedang logout di jalur normal (race) | Loop ke-2 dijalankan lebih dulu dan menghapus handle dari `manager`; sweep hanya melihat sisa baris |
| `deleteAuthState` gagal (DB error) menggagalkan seluruh reconcile | Bungkus per-sesi `try/catch` + `logger.warn` agar sesi lain tetap diproses |
| Query tambahan tiap 15 detik | `listByStatus('logged_out')` memakai index status; jumlah baris kecil |

### 7.6 Checklist

- [x] Tambah sweep `logged_out` di `reconcileSessions()`
- [x] Import `deleteAuthState`
- [x] Bungkus `deleteAuthState` per sesi dengan `try/catch` + `logger.warn`
- [x] Tambah test di `reconcile.test.ts` (auth ada, auth tidak ada, `deleteAuthState` reject)
- [x] Jalankan `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Verifikasi manual: logout sesi → cek `wa_auth_creds`/`wa_auth_keys` kosong dalam ≤15 detik

## 8. Plan tambahan — Dokumentasi API (Hono + Scalar)

Status: selesai dikerjakan (2026-11-16) kecuali cek manual di browser
Dependensi baru: `@hono/zod-openapi@1.6.3`, `@scalar/hono-api-reference@0.12.20`

### 8.1 Tujuan

- Spesifikasi **OpenAPI 3.1** dihasilkan langsung dari route + schema zod (bukan file manual, supaya tidak drift).
- UI interaktif memakai **Scalar** di `GET /docs`.
- Spec mentah tersedia di `GET /openapi.json` untuk dipakai tooling lain (Postman, codegen, dsb).

### 8.2 Kondisi saat ini (bukti kode)

- `packages/backend/package.json:25,31` — `hono@4.13.18`, `zod@4.6.7`. Belum ada paket OpenAPI/Scalar.
- `packages/backend/src/api/app.ts:61-93` — `createApp()` memakai `new Hono<AppBindings>()`, semua router di-mount via `app.route(...)`.
- Route masih `new Hono<AppBindings>()` + validasi manual `parseOrThrow()` (`api/routes/sessions.ts:35,43`, `api/validation.ts:5-12`).
- `packages/shared/src/contracts/*` **sudah** berisi schema zod lengkap untuk request & response (`createSessionSchema`, `sessionSchema`, `sessionLiveSchema`, dst) — bisa langsung dipakai sebagai sumber dokumentasi.
- Total 22 endpoint di 5 file route: sessions (13), messages (4), broadcasts (3), stats (1), health (1).
- Penamaan & versi aplikasi sudah terpusat di `api/version.ts` (`APP_NAME`, `APP_VERSION`).

### 8.3 Pilihan pendekatan

| Opsi | Cara kerja | Perubahan kode | Catatan |
| --- | --- | --- | --- |
| **A. `@hono/zod-openapi` + `@scalar/hono-api-reference`** (rekomendasi) | Route didefinisikan via `createRoute()`, router jadi `OpenAPIHono`; spec digenerate dari route | Sedang — semua file route ditulis ulang bagian deklarasinya, handler tetap | Paling rapi & typed; `@hono/zod-openapi@1.6.3` mendukung `zod ^4` + `hono >=4.10`; Scalar `0.12.20` peer `hono ^4.12.5` → kompatibel |
| B. `hono-openapi` | Tetap `Hono` biasa, tambah `describeRoute()` + `validator()` di tiap endpoint | Kecil | Lebih cepat dipasang, tapi metadata tersebar dan dokumentasi route tidak dipaksa lengkap |
| C. Spec statis (`openapi.yaml`) + Scalar | Tidak menyentuh route | Kecil | Cepat basi, tidak mengikuti kontrak `@wa/shared` — tidak dipakai |

Keputusan: **Opsi A**, dikerjakan per file route agar tiap langkah masih hijau.

### 8.4 Rancangan (opsi A)

**Dependensi baru** (`packages/backend/package.json` — perlu konfirmasi dulu sesuai AGENTS.md):

```json
"@hono/zod-openapi": "1.6.3",
"@scalar/hono-api-reference": "0.12.20"
```

**File baru `packages/backend/src/api/openapi.ts`:**

- `OpenAPIHono<AppBindings>` dengan `defaultHook` yang melempar `ValidationError` hasil `parseOrThrow`-style, supaya body error tetap `apiErrorBody` (`api/middleware/error.ts:8-15`) dan bukan format default zod validator.
- Registrasi security scheme:
  - `ApiKey` — bearer API key untuk `/sessions`, `/messages`, `/stats` (lihat `app.ts:81-84`).
  - `SessionToken` — bearer token sesi untuk `/sessions/:id/messages` (`api/middleware/session-token.ts`).
- Info dokumen dari `APP_NAME`/`APP_VERSION`; `servers` opsional dari env.
- Endpoint dokumentasi:
  - `GET /openapi.json` → `c.json(app.getOpenAPIDocument({ openapi: '3.1.0', info }))`
  - `GET /docs` → `apiReference({ spec: { url: '/openapi.json' } })`

**Perubahan `packages/backend/src/api/app.ts`:**

- Ganti `new Hono()` → `createOpenApiApp(deps)` (atau `OpenAPIHono` langsung di `createApp`).
- Mount `/docs` dan `/openapi.json` **sebelum** middleware API key (`app.ts:81-84`) agar publik; CORS & request logger (`app.ts:66-67`) tetap berlaku.
- Handler `handleError`/`notFound` tidak berubah.

**Konversi route (per file, satu commit per file):**

Urutan dari yang paling kecil: `stats.ts` → `health.ts` → `broadcasts.ts` → `messages.ts` → `sessions.ts`.

Pola per endpoint:

```ts
const listSessions = createRoute({
  method: 'get',
  path: '/',
  tags: ['Sessions'],
  security: [{ ApiKey: [] }],
  request: { query: listQuerySchema },
  responses: {
    200: { description: 'Daftar sesi', content: { 'application/json': { schema: sessionListSchema } } },
    429: { description: 'Rate limit', content: { 'application/json': { schema: apiErrorSchema } } },
  },
})

router.openapi(listSessions, async (c) => {
  const { limit } = c.req.valid('query')
  return c.json({ items: [...], nextCursor: null }, 200)
})
```

- Schema request/response diambil dari `@wa/shared` (tidak ada duplikasi).
- `parseOrThrow` tetap dipakai untuk endpoint yang butuh validasi non-body (mis. `sessions.ts:44`) atau diganti `c.req.valid(...)` bila schema sudah terpasang di `createRoute`.
- Tambah `openapi('NamaKomponen')`/ref hanya bila schema dipakai berulang dan perlu muncul sebagai komponen (mis. `Session`), supaya spec tidak meng-unroll objek yang sama berulang kali.
- Status code yang didokumentasikan mengikuti implementasi nyata: 200/201/204, 401, 404, 409, 422, 429, 500.

### 8.5 Cakupan dokumentasi

| Tag | Endpoint | Auth |
| --- | --- | --- |
| Health | `GET /` | publik |
| Stats | `GET /stats` | ApiKey |
| Sessions | `GET /`, `POST /`, `GET /:id`, `DELETE /:id`, `POST /:id/login`, `POST /:id/cancel`, `POST /:id/logout`, `POST /:id/token`, `GET /:id/status`, `GET /:id/qr`, `GET /:id/live`, `GET /:id/pairing`, `POST /:id/pairing`, `POST /:id/broadcast`, `GET /:id/broadcast/current`, `POST /:id/broadcast/cancel` | ApiKey |
| Messages (sesi) | `POST /sessions/:id/messages`, `GET /sessions/:id/messages` | SessionToken |
| Messages | `GET /messages`, `DELETE /messages/:id` | ApiKey |
| Docs | `GET /docs`, `GET /openapi.json` | publik |

Catatan: baris "Sessions" menggabungkan 13 route di `sessions.ts` + 3 route broadcast di `broadcasts.ts` (keduanya di-mount di base path `/sessions`); jangan menambah endpoint baru di task dokumentasi ini.

### 8.6 Test

File: `packages/backend/src/api/app.test.ts`

1. `GET /docs` → 200, `content-type` HTML, body memuat referensi Scalar.
2. `GET /openapi.json` → 200, `openapi: '3.1.0'`, `paths['/sessions']` ada, `securitySchemes.ApiKey` terdaftar.
3. Regresi: `GET /sessions` tanpa API key tetap 401 dan body error tetap `apiErrorBody`.
4. Regresi: `POST /sessions` body invalid tetap 422 `VALIDATION_ERROR` (memastikan `defaultHook` bekerja).

### 8.7 Risiko & mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Format error validasi berubah (zod validator default 400) | `defaultHook` melempar `ValidationError` → tetap 422 + `apiErrorBody` |
| Konversi route mengubah perilaku (status code/response) | Kerjakan per file, jalankan `pnpm test` tiap langkah; test lama di `app.test.ts` dipertahankan |
| `getOpenAPIDocument` tidak memuat sub-router | Pastikan semua sub-router juga `OpenAPIHono` dan di-mount setelah registry dibuat |
| Dependensi baru ditolak / versi bentrok | Konfirmasi dulu; versi dipin seperti dependensi lain (tanpa `^`) |
| `/docs` terbuka di produksi | Default publik (tidak ada data sensitif); bila perlu, tambahkan flag env `DOCS_ENABLED` — keputusan menyusul |

### 8.8 Checklist

- [x] Konfirmasi penambahan dependensi `@hono/zod-openapi` + `@scalar/hono-api-reference`
- [x] Buat `api/openapi.ts` (OpenAPIHono + defaultHook + security schemes + info)
- [x] Daftarkan `GET /docs` dan `GET /openapi.json` sebelum middleware API key
- [x] Konversi `stats.ts`
- [x] Konversi `health.ts`
- [x] Konversi `broadcasts.ts`
- [x] Konversi `messages.ts`
- [x] Konversi `sessions.ts`
- [x] Tambah 4 test di `app.test.ts`
- [x] Jalankan `pnpm lint && pnpm typecheck && pnpm test`
- [ ] Cek manual: buka `/docs`, coba 1 endpoint dengan API key

### 8.9 Catatan implementasi

- Spec OpenAPI 3.1 digenerate dengan `getOpenAPI31Document()` (bukan `getOpenAPIDocument()`, yang menghasilkan 3.0).
- Middleware Scalar memakai export `Scalar`; `apiReference` adalah alias deprecated.
- Security scheme `ApiKey` didokumentasikan sebagai **apiKey di header `x-api-key`** (sesuai `middleware/api-key.ts`), bukan bearer. `SessionToken` bearer untuk endpoint pesan per sesi.
- `GET /sessions` tidak mendokumentasikan query `limit`/`cursor` karena handler masih memakai limit tetap (50). `listQuerySchema` di `@wa/shared` belum dipakai.
- `handleError` sekarang memetakan `HTTPException` dari validator zod-openapi (JSON rusak/content-type salah) agar tetap `apiErrorBody` dan bukan 500.
- Schema respons dibiarkan inline (bukan `components.schemas` + `$ref`): pada zod 4, `registry.register()` mengembalikan instance schema baru, sehingga route harus memakai instance tersebut dan type inference respons hilang. Ukuran spec ~55 KB masih wajar untuk Scalar.
- Halaman `/docs` memuat bundle Scalar dari CDN jsDelivr; tanpa koneksi internet UI tidak ter-render.

## 9. Catatan tambahan (menunggu input)

> Bagian ini untuk catatan lain dari pemilik repo sebelum eksekusi.