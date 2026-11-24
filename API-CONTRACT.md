# API Contract — WA Bot Console

> Dokumen ini dihasilkan dari skema OpenAPI yang sama dengan `GET /v1/openapi.json` (3.1.0), versi API `0.1.0`. Sumber kebenaran runtime: `packages/backend/src/api/routes/*` dan `packages/shared/src/contracts/*`.

## Ringkasan

| Item            | Nilai                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Base URL (dev)  | `http://localhost:8467`                                                                                                |
| Versi API       | `0.1.0`                                                                                                                |
| Autentikasi     | `x-api-key` (admin) atau `Authorization: Bearer <token login sales>`; endpoint mesin per sesi juga menerima token sesi |
| Konten          | `application/json` (UTF-8); SSE pada `GET /v1/sessions/{id}/events`                                                    |
| Format waktu    | ISO-8601 UTC (`2026-11-17T03:00:00.000Z`); "hari ini" memakai `APP_TIMEZONE`                                           |
| Jumlah endpoint | 44 operasi pada 36 path                                                                                                |

## Konvensi

### Autentikasi

- **Admin** mengirim `x-api-key` (dibuat lewat `pnpm db:seed:key`, hanya tampil sekali) dan boleh mengakses semua endpoint.
- **Sales** login lewat `POST /v1/auth/login` (nomor WhatsApp + PIN) lalu mengirim
  `Authorization: Bearer <token login>`; token berlaku 7 hari dan dicabut oleh `POST /v1/auth/logout`.
- Sales hanya boleh membaca sesi, koneksi, dan inbox miliknya. Endpoint admin (create/delete sesi,
  token, pairing, reset PIN, riwayat lintas sesi, webhook, stats, settings) membalas `403 FORBIDDEN`.
- `GET /v1/sessions` untuk sales otomatis difilter ke sesinya; akses ke sesi milik sales lain juga `403`
  (bukan `404`), termasuk inbox, SSE, kirim balasan, riwayat pesan, dan broadcast.
- `GET /v1/sessions/{id}/messages` dan `POST /v1/sessions/{id}/messages` menerima **salah satu**:
  `x-api-key`, `Authorization: Bearer <token login sales>`, atau `Authorization: Bearer <token sesi>`.
- Login dibatasi 5 percobaan / 5 menit per IP dan per nomor → `429` + `Retry-After: 300`.
- Header hilang atau tidak valid → `401` dengan `code: UNAUTHORIZED`.

### Format error

```json
{
  "error": {
    "code": "validasi_error_snake_case",
    "message": "Pesan untuk manusia"
  }
}
```

| HTTP | `code`                     | Kapan                                                    |
| ---- | -------------------------- | -------------------------------------------------------- |
| 400  | kode domain tanpa pemetaan | Error domain lain                                        |
| 401  | `UNAUTHORIZED`             | API key / token sesi tidak ada atau tidak valid          |
| 403  | `FORBIDDEN`                | Aksi dilarang untuk kredensial tersebut                  |
| 404  | `NOT_FOUND`                | Resource tidak ada, termasuk path tak dikenal            |
| 409  | `CONFLICT`                 | Bentrok state, misalnya sesi sedang dipakai              |
| 422  | `VALIDATION_ERROR`         | Body/query/path tidak lolos skema, atau body JSON rusak  |
| 422  | `SESSION_NOT_READY`        | Sesi belum `connected` saat mengirim pesan               |
| 422  | `SEND_TIMEOUT`             | WhatsApp tidak merespons                                 |
| 429  | `RATE_LIMITED`             | Melebihi kuota per menit, lihat header `Retry-After: 60` |
| 500  | `INTERNAL_ERROR`           | Kesalahan tak terduga (detail tidak dibocorkan)          |

### Pagination

Endpoint daftar memakai `limit` (default 20, maksimum 100) dan `cursor` opak. Respons selalu `{ "items": [...], "nextCursor": "..." }`; `nextCursor: null` menandakan halaman terakhir. Jangan menyusun cursor sendiri.

### Rate limit

Kuota dihitung per API key dan per sesi dalam jendela 60 detik (`RATE_LIMIT_PER_MIN`, default 240). Melewati kuota → `429` + header `Retry-After: 60`.

### Idempotensi & status asinkron

- Kirim pesan dan broadcast mengembalikan `202` + status awal (`queued`). Status final diamati lewat `GET /v1/messages`, `GET /v1/conversations/{id}/messages`, SSE, atau webhook `message.status`.
- `clientRef` unik per sesi. Mengirim ulang `clientRef` yang sama mengembalikan `200` dengan `duplicate: true` dan record pesan lama (tidak mengirim ulang).
- Pesan hanya diterima bila sesi berstatus `connected`; selain itu `422 SESSION_NOT_READY`.

## Daftar endpoint

### Health

| Method | Path         | Auth   | Ringkasan          |
| ------ | ------------ | ------ | ------------------ |
| `GET`  | `/v1/health` | publik | Status layanan API |

### Stats

| Method | Path        | Auth        | Ringkasan                   |
| ------ | ----------- | ----------- | --------------------------- |
| `GET`  | `/v1/stats` | `x-api-key` | Statistik ringkas dashboard |

### Auth

| Method | Path              | Auth                      | Ringkasan                              |
| ------ | ----------------- | ------------------------- | -------------------------------------- |
| `POST` | `/v1/auth/login`  | publik + rate limit ketat | Login sales (nomor WhatsApp + PIN)     |
| `GET`  | `/v1/auth/me`     | `x-api-key` / `Bearer`    | Identitas aktor (`admin` atau `sales`) |
| `POST` | `/v1/auth/logout` | `x-api-key` / `Bearer`    | Cabut token login sales (idempoten)    |

### Settings

| Method  | Path           | Auth        | Ringkasan                                     |
| ------- | -------------- | ----------- | --------------------------------------------- |
| `GET`   | `/v1/settings` | `x-api-key` | `maxSales`, jumlah sales aktif, default delay |
| `PATCH` | `/v1/settings` | `x-api-key` | Ubah batas sales dan default delay broadcast  |

### Sessions

| Method   | Path                                  | Auth                   | Ringkasan                                |
| -------- | ------------------------------------- | ---------------------- | ---------------------------------------- |
| `GET`    | `/v1/sessions`                        | `x-api-key` / `Bearer` | Daftar sesi (sales: hanya miliknya)      |
| `POST`   | `/v1/sessions`                        | `x-api-key`            | Buat sesi baru + akun sales opsional     |
| `GET`    | `/v1/sessions/{id}`                   | `x-api-key` / `Bearer` | Detail satu sesi (scoped untuk sales)    |
| `DELETE` | `/v1/sessions/{id}`                   | `x-api-key`            | Hapus sesi + akun sales pemiliknya       |
| `PATCH`  | `/v1/sessions/{id}/sales`             | `x-api-key`            | Tautkan akun sales ke sesi lama          |
| `POST`   | `/v1/sessions/{id}/sales/pin`         | `x-api-key`            | Reset PIN sales + cabut token lama       |
| `POST`   | `/v1/sessions/{id}/broadcast/cancel`  | `x-api-key` / `Bearer` | Batalkan broadcast aktif                 |
| `GET`    | `/v1/sessions/{id}/broadcast/current` | `x-api-key` / `Bearer` | Broadcast yang sedang berjalan pada sesi |
| `POST`   | `/v1/sessions/{id}/cancel`            | `x-api-key` / `Bearer` | Batalkan proses pairing (scoped sales)   |
| `GET`    | `/v1/sessions/{id}/live`              | `x-api-key` / `Bearer` | Gabungan state dashboard sesi            |
| `POST`   | `/v1/sessions/{id}/login`             | `x-api-key` / `Bearer` | Mulai koneksi WhatsApp (scoped sales)    |
| `POST`   | `/v1/sessions/{id}/logout`            | `x-api-key`            | Logout sesi dan hapus auth tersimpan     |
| `GET`    | `/v1/sessions/{id}/pairing`           | `x-api-key` / `Bearer` | Pairing code terakhir sesi               |
| `POST`   | `/v1/sessions/{id}/pairing`           | `x-api-key` / `Bearer` | Dinonaktifkan (pairing hanya lewat QR)   |
| `GET`    | `/v1/sessions/{id}/qr`                | `x-api-key` / `Bearer` | QR terakhir sesi                         |
| `GET`    | `/v1/sessions/{id}/status`            | `x-api-key` / `Bearer` | Status ringkas sesi                      |
| `POST`   | `/v1/sessions/{id}/token`             | `x-api-key`            | Rotasi token sesi                        |

### Messages (sesi)

| Method | Path                         | Auth                                             | Ringkasan                    |
| ------ | ---------------------------- | ------------------------------------------------ | ---------------------------- |
| `GET`  | `/v1/sessions/{id}/messages` | `x-api-key`, `Bearer` sales, **atau** token sesi | Riwayat pesan sebuah sesi    |
| `POST` | `/v1/sessions/{id}/messages` | `x-api-key`, `Bearer` sales, **atau** token sesi | Kirim pesan dari sebuah sesi |

### Messages

| Method   | Path                      | Auth                   | Ringkasan                    |
| -------- | ------------------------- | ---------------------- | ---------------------------- |
| `GET`    | `/v1/messages`            | `x-api-key`            | Riwayat pesan lintas sesi    |
| `DELETE` | `/v1/messages/{id}`       | `x-api-key`            | Soft delete satu pesan       |
| `POST`   | `/v1/messages/{id}/retry` | `x-api-key`            | Kirim ulang pesan yang gagal |
| `POST`   | `/v1/messages`            | `x-api-key` / `Bearer` | Kirim pesan teks lintas sesi |

### Conversations

| Method | Path                              | Auth                   | Ringkasan                    |
| ------ | --------------------------------- | ---------------------- | ---------------------------- |
| `GET`  | `/v1/conversations/{id}/messages` | `x-api-key` / `Bearer` | Riwayat pesan satu room      |
| `POST` | `/v1/conversations/{id}/read`     | `x-api-key` / `Bearer` | Tandai room sudah dibaca     |
| `GET`  | `/v1/sessions/{id}/conversations` | `x-api-key` / `Bearer` | Daftar room chat sebuah sesi |

### Events

| Method | Path                       | Auth                   | Ringkasan                         |
| ------ | -------------------------- | ---------------------- | --------------------------------- |
| `GET`  | `/v1/sessions/{id}/events` | `x-api-key` / `Bearer` | Stream event real-time sesi (SSE) |

### Broadcasts

| Method | Path                        | Auth                   | Ringkasan                               |
| ------ | --------------------------- | ---------------------- | --------------------------------------- |
| `POST` | `/v1/broadcasts`            | `x-api-key` / `Bearer` | Buat broadcast teks, opsional terjadwal |
| `GET`  | `/v1/broadcasts/{id}`       | `x-api-key` / `Bearer` | Status dan progres broadcast            |
| `POST` | `/v1/broadcasts/{id}/pause` | `x-api-key` / `Bearer` | Jeda broadcast berjalan                 |
| `POST` | `/v1/broadcasts/{id}/start` | `x-api-key` / `Bearer` | Mulai atau lanjutkan broadcast          |

### Webhooks

| Method   | Path                              | Auth        | Ringkasan                       |
| -------- | --------------------------------- | ----------- | ------------------------------- |
| `GET`    | `/v1/webhooks`                    | `x-api-key` | Daftar endpoint webhook         |
| `POST`   | `/v1/webhooks`                    | `x-api-key` | Daftarkan endpoint webhook      |
| `PATCH`  | `/v1/webhooks/{id}`               | `x-api-key` | Perbarui endpoint webhook       |
| `DELETE` | `/v1/webhooks/{id}`               | `x-api-key` | Hapus endpoint webhook          |
| `GET`    | `/v1/webhooks/{id}/deliveries`    | `x-api-key` | Log pengiriman endpoint webhook |
| `POST`   | `/v1/webhooks/{id}/rotate-secret` | `x-api-key` | Rotasi secret endpoint webhook  |

## Detail endpoint

### Auth

#### `POST /v1/auth/login` — Login sales

Auth: publik (rate limit 5 percobaan / 5 menit per IP dan per nomor)

**Body**

```ts
{
  phoneNumber: string // 8–15 digit, tanpa spasi/tanda baca
  pin: string // 4–8 digit angka
}
```

**Respons `200`**

```ts
{
  token: string // opaque, disimpan sebagai hash, berlaku 7 hari
  expiresAt: string // ISO-8601
  user: {
    id: string
    name: string
    phoneNumber: string
    role: 'admin' | 'sales'
    active: boolean
  }
}
```

**Error** — `401 UNAUTHORIZED` dengan pesan selalu `Nomor atau PIN salah` (nomor tidak terdaftar,
PIN salah, atau user nonaktif); `403 NO_SESSION` bila nomor belum punya sesi WhatsApp;
`409 SALES_LIMIT_REACHED`; `422 VALIDATION_ERROR`; `429 RATE_LIMITED` + `Retry-After: 300`.

#### `GET /v1/auth/me` — Identitas aktor

Auth: `x-api-key` atau `Bearer`

**Respons `200`**

```ts
{ mode: 'admin', user: null }
{ mode: 'sales', user: { id, name, phoneNumber, role: 'sales', active } }
```

#### `POST /v1/auth/logout` — Cabut token sales

Auth: `x-api-key` atau `Bearer`

**Respons `204`** — token sales dicabut; idempoten. Token yang sudah dicabut/kedaluwarsa → `401`.

### Settings

#### `GET /v1/settings` — Batas sales dan default delay broadcast

Auth: `x-api-key` (admin)

**Respons `200`**

```ts
{
  maxSales: number // 1..100
  salesCount: number
  defaultMinDelay: number // detik, 10..600
  defaultMaxDelay: number // detik, 10..600
}
```

#### `PATCH /v1/settings` — Ubah batas sales dan default delay broadcast

Auth: `x-api-key` (admin)

**Body** — minimal satu field; `defaultMinDelay` dan `defaultMaxDelay` wajib dikirim bersama.

```ts
{
  maxSales?: number // 1..100
  defaultMinDelay?: number // 10..600
  defaultMaxDelay?: number // 10..600, >= defaultMinDelay
}
```

**Respons `200`** — objek yang sama dengan `GET /v1/settings`; `422 VALIDATION_ERROR` bila nilai di luar rentang atau urutan delay tidak valid.

### Health

#### `GET /v1/health` — Status layanan API

Auth: publik

**Respons `200`** — Status API, hasil ping database/Redis, dan metrik operasional

```ts
{
  name: string
  version: string
  status: 'ok' | 'degraded'
  checks: {
    database: boolean
    redis: boolean
  }
  metrics: {
    inbound: {
      processed: number
      duplicates: number
      nonText: number
    }
    sse: {
      activeConnections: number
    }
    webhooks: {
      delivered: number
      failed: number
      retry: number
      pendingDue: number
      outboxLagMs: number
    }
    optOuts: number
    broadcastsPaused: number
  }
}
```

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Stats

#### `GET /v1/stats` — Statistik ringkas dashboard

Auth: `x-api-key`

**Respons `200`** — Statistik sesi, pesan, broadcast, dan deret bucket per periode

```ts
{
  connectedSessions: number
  periodMessages: number          // periode berjalan, status sent|delivered|read
  previousPeriodMessages: number  // periode penuh tepat sebelumnya (delta)
  periodFailed: number            // status failed pada periode berjalan
  totalMessages: number
  runningBroadcasts: number
  todayDate: string               // YYYY-MM-DD versi APP_TIMEZONE
  bucketKind: 'day' | 'week' | 'month'
  buckets: {
    startDate: string             // YYYY-MM-DD, inklusif
    endDate: string               // YYYY-MM-DD, inklusif
    sent: number
    failed: number
  }[]
}
```

Bentuk bucket per `period`:

| `period` | `bucketKind` | Jumlah bucket | Isi                                                        |
| -------- | ------------ | ------------- | ---------------------------------------------------------- |
| `day`    | `day`        | 7             | Minggu berjalan Sen–Min; hanya hari ini berisi data        |
| `week`   | `day`        | 7             | Minggu berjalan Sen–Min; Senin s/d hari ini berisi data    |
| `month`  | `week`       | 4–5           | Bulan berjalan, dibagi rata jadi bucket 5–7 hari           |
| `year`   | `month`      | 12            | Bulan kalender tahun berjalan                              |

- Bucket bulanan memakai pembagian seimbang: `n = ceil(hari / 7)`, panjang `floor(hari / n)` dengan `hari % n` bucket pertama dapat +1 hari. Hasil: 28 → `7 7 7 7`, 29 → `6 6 6 6 5`, 30 → `6 6 6 6 6`, 31 → `7 6 6 6 6`.
- Semua tanggal `YYYY-MM-DD` ditafsirkan dalam `APP_TIMEZONE`; `startDate` dan `endDate` keduanya inklusif.
- Invariant angka ↔ chart: untuk `day` hanya `buckets[indexHariIni].sent === periodMessages`; untuk `week`/`month`/`year` jumlah semua `sent` = `periodMessages`.
- `bucketKind` dikirim backend agar klien tidak menebak format label dari state lokal.

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Sessions

#### `GET /v1/sessions` — Daftar sesi WhatsApp

Auth: `x-api-key`

**Respons `200`** — Maksimal 50 sesi terbaru

```ts
{
  items: {
    id: string
    publicId: string
    label: string
    phoneNumber: string | null
    status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
    lastConnectedAt: string | null
    salesId: string | null
    agentId: string | null
    salesName: string | null
    createdAt: string
  }
  ;[]
  nextCursor: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions` — Buat sesi baru

Auth: `x-api-key`

**Body**

```ts
{
  label: string (min 1, max 255)
  publicId?: string (pattern ^[A-Za-z0-9_-]{1,32}$)
  mode?: "qr" | "pairing"
  phoneNumber?: string (pattern ^\d{8,15}$)
  salesId?: string (max 64)
  agentId?: string (max 64)
  salesName?: string (min 1, max 255) // wajib bersama pin dan phoneNumber
  pin?: string (pattern ^\d{4,8}$)    // hash scrypt, tidak pernah dikembalikan
}
```

**Respons `201`** — Sesi dibuat beserta token sesi

```ts
{
  token: string
  session: {
    id: string
    publicId: string
    label: string
    phoneNumber: string | null
    status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
    lastConnectedAt: string | null
    salesId: string | null
    agentId: string | null
    salesName: string | null
    createdAt: string
  }
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `409`** — publicId atau nomor sudah dipakai sesi lain, atau batas jumlah sales tercapai (`SALES_LIMIT_REACHED`) · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Data sesi tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}` — Detail satu sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Detail sesi

```ts
{
  id: string
  publicId: string
  label: string
  phoneNumber: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
  lastConnectedAt: string | null
  salesId: string | null
  agentId: string | null
  salesName: string | null
  createdAt: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `DELETE /v1/sessions/{id}` — Hapus sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `204`** — Sesi dihapus

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/broadcast/cancel` — Batalkan broadcast aktif

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Broadcast dibatalkan

```ts
{
  broadcastId: string
  status: 'draft' | 'scheduled' | 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Broadcast tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/broadcast/current` — Broadcast yang sedang berjalan pada sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Broadcast aktif; field bernilai kosong bila tidak ada broadcast

```ts
{
  jobId: string | null
  status: 'draft' |
    'scheduled' |
    'pending' |
    'running' |
    'paused' |
    'done' |
    'failed' |
    'cancelled' |
    null
  total: number
  done: number
  sent: number
  failed: number
  skipped: number
  optedOut: number
  scheduledAt: string | null
  pauseReason: string | null
  recipients: {
    id: number
    to: string
    name: string | null
    status: 'pending' | 'sent' | 'failed' | 'skipped'
    error: string | null
  }
  ;[]
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/cancel` — Batalkan proses pairing

Auth: `x-api-key` / `Bearer` (scoped untuk sales)

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Sesi diputus dan QR dikosongkan

```ts
{
  id: string
  publicId: string
  label: string
  phoneNumber: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
  lastConnectedAt: string | null
  salesId: string | null
  agentId: string | null
  salesName: string | null
  createdAt: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `409`** — Sesi tidak sedang dalam proses pairing · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/live` — Gabungan state dashboard sesi

Auth: `x-api-key` / `Bearer` (scoped untuk sales)

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Sesi, QR, pairing code, dan broadcast aktif

```ts
{
  session: {
    id: string
    publicId: string
    label: string
    phoneNumber: string | null
    status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
    lastConnectedAt: string | null
    salesId: string | null
    agentId: string | null
    salesName: string | null
    createdAt: string
  }
  qr: string | null
  pairingCode: string | null
  defaultDelay: {
    min: number
    max: number
  }
  broadcast: {
    jobId: string | null
    status: 'draft' |
      'scheduled' |
      'pending' |
      'running' |
      'paused' |
      'done' |
      'failed' |
      'cancelled' |
      null
    total: number
    done: number
    sent: number
    failed: number
    skipped: number
    optedOut: number
    scheduledAt: string | null
    pauseReason: string | null
    recipients: {
      id: number
      to: string
      name: string | null
      status: 'pending' | 'sent' | 'failed' | 'skipped'
      error: string | null
    }
    ;[]
  }
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/login` — Mulai koneksi WhatsApp untuk sesi

Auth: `x-api-key` / `Bearer` (scoped untuk sales)

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Sesi masuk status connecting

```ts
{
  id: string
  publicId: string
  label: string
  phoneNumber: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
  lastConnectedAt: string | null
  salesId: string | null
  agentId: string | null
  salesName: string | null
  createdAt: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `409`** — Sesi sudah terhubung; logout dulu untuk pairing ulang · `{ error: { code: 'CONFLICT', message } }`

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/logout` — Logout sesi dan hapus auth tersimpan

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Sesi berstatus logged_out

```ts
{
  id: string
  publicId: string
  label: string
  phoneNumber: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
  lastConnectedAt: string | null
  salesId: string | null
  agentId: string | null
  salesName: string | null
  createdAt: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/pairing` — Pairing code terakhir sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Pairing code dan status sesi

```ts
{
  code: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/pairing` — Pairing dengan kode (dinonaktifkan)

Auth: `x-api-key` / `Bearer`

Pairing dengan kode dinonaktifkan sementara; hanya pairing lewat QR yang didukung.

**Respons `409`** — Pairing dengan kode dinonaktifkan; gunakan QR · `{ error: { code: 'CONFLICT', message } }`

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `409`** — Nomor sudah dipakai sesi lain · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Nomor tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/qr` — QR terakhir sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — QR (data URL) dan status sesi

```ts
{
  qr: string | null
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/status` — Status ringkas sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Status sesi

```ts
{
  status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
  statusLabel: string
  phoneNumber: string | null
  salesId: string | null
  agentId: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/token` — Rotasi token sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Token sesi baru

```ts
{
  token: string
  session: {
    id: string
    publicId: string
    label: string
    phoneNumber: string | null
    status: 'created' | 'qr_pending' | 'connecting' | 'connected' | 'disconnected' | 'logged_out'
    lastConnectedAt: string | null
    salesId: string | null
    agentId: string | null
    salesName: string | null
    createdAt: string
  }
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `PATCH /v1/sessions/{id}/sales` — Tautkan akun sales ke sesi lama

Auth: `x-api-key` (admin)

**Body**

```ts
{ salesName: string (min 1, max 255), pin: string (4–8 digit) }
```

Akun memakai `phoneNumber` sesi; bila akun sales dengan nomor itu sudah ada, akun dipakai ulang
(nama dan PIN diperbarui, token login lama dicabut). Sesi harus belum punya owner.

**Respons `200`** — `SessionDto` (`salesName` terisi); `409 CONFLICT` bila sesi sudah punya sales,
nomor sudah dipakai sesi lain, akun bukan sales, atau `SALES_LIMIT_REACHED`;
`422 VALIDATION_ERROR` bila sesi belum punya nomor atau PIN tidak valid.

#### `POST /v1/sessions/{id}/sales/pin` — Reset PIN sales

Auth: `x-api-key` (admin)

**Body**

```ts
{
  pin: string
} // 4–8 digit
```

**Respons `200`** — `SessionDto`; PIN lama tidak berlaku dan seluruh token login sales dicabut.
`409 CONFLICT` bila sesi belum punya akun sales; `422 VALIDATION_ERROR` bila PIN tidak valid.

### Messages (sesi)

#### `GET /v1/sessions/{id}/messages` — Riwayat pesan sebuah sesi

Auth: `x-api-key` **atau** `Authorization: Bearer <token sesi>`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Query parameter**

| Nama        | Tipe                     | Wajib | Default | Keterangan |
| ----------- | ------------------------ | ----- | ------- | ---------- |
| `limit`     | integer (min 1, max 100) | tidak | 20      | —          |
| `cursor`    | string                   | tidak | —       | —          |
| `direction` | "in"                     | "out" | tidak   | —          | —   |

**Respons `200`** — Halaman riwayat pesan sesi

```ts
{
  items: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  ;[]
  nextCursor: string | null
}
```

**Respons `401`** — API key / token sesi tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Query tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/sessions/{id}/messages` — Kirim pesan dari sebuah sesi

Auth: `x-api-key` **atau** `Authorization: Bearer <token sesi>`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Body**

```ts
{
  to: string (min 8, max 32)
  clientRef: string (min 1, max 191)
  text: string (min 1, max 4096)
  customerId?: string (max 64)
  customerName?: string (max 255)
}
```

**Respons `200`** — Pesan duplikat (clientRef sudah pernah dikirim)

```ts
{
  message: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  duplicate: boolean
}
```

**Respons `202`** — Pesan masuk antrean pengiriman

```ts
{
  message: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  duplicate: boolean
}
```

**Respons `401`** — API key / token sesi tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Data pesan tidak valid atau sesi belum terhubung · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Messages

#### `GET /v1/messages` — Riwayat pesan lintas sesi

Auth: `x-api-key`

**Query parameter**

| Nama        | Tipe                     | Wajib | Default | Keterangan |
| ----------- | ------------------------ | ----- | ------- | ---------- |
| `limit`     | integer (min 1, max 100) | tidak | 50      | —          |
| `sessionId` | string (UUID)            | tidak | —       | `wa_sessions.id` |
| `direction` | "in"                     | "out" | tidak   | —          | —   |

**Respons `200`** — Halaman riwayat pesan

```ts
{
  items: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  ;[]
  nextCursor: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Query tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `DELETE /v1/messages/{id}` — Soft delete satu pesan

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `204`** — Pesan dihapus

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Pesan tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/messages/{id}/retry` — Kirim ulang pesan yang gagal

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `202`** — Pesan masuk antrean pengiriman ulang

```ts
{
  message: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Pesan tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `409`** — Status pesan berubah saat diproses · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Pesan tidak berstatus gagal · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/messages` — Kirim pesan teks lintas sesi

Auth: `x-api-key`

**Body**

```ts
{
  to: string (min 8, max 32)
  clientRef: string (min 1, max 191)
  text: string (min 1, max 4096)
  customerId?: string (max 64)
  customerName?: string (max 255)
  sessionId: string (UUID wa_sessions.id)
}
```

**Respons `200`** — Pesan duplikat (clientRef sudah pernah dikirim)

```ts
{
  message: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  duplicate: boolean
}
```

**Respons `202`** — Pesan masuk antrean pengiriman

```ts
{
  message: {
    id: string
    sessionId: string
    to: string | null
    clientRef: string | null
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    waMessageId: string | null
    error: string | null
    customerName: string | null
    createdAt: string
    deletedAt: string | null
  }
  duplicate: boolean
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Data pesan tidak valid atau sesi belum terhubung · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Conversations

#### `GET /v1/conversations/{id}/messages` — Riwayat pesan satu room

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Query parameter**

| Nama     | Tipe                     | Wajib | Default | Keterangan |
| -------- | ------------------------ | ----- | ------- | ---------- |
| `limit`  | integer (min 1, max 100) | tidak | 20      | —          |
| `cursor` | string                   | tidak | —       | —          |

**Respons `200`** — Halaman pesan room chat

```ts
{
  items: {
    id: string
    conversationId: string
    sessionId: string
    direction: 'in' | 'out'
    type: string
    body: string | null
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed'
    clientRef: string | null
    waMessageId: string | null
    createdAt: string
  }
  ;[]
  nextCursor: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Percakapan tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Query tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/conversations/{id}/read` — Tandai room sudah dibaca

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Unread count direset dan pesan masuk ditandai read

```ts
{
  id: string
  sessionId: string
  waJid: string
  waJidAlt: string | null
  lastMessageAt: string | null
  unreadCount: integer (min 0)
  customerNames: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Percakapan tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/sessions/{id}/conversations` — Daftar room chat sebuah sesi

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan           |
| ---- | -------------- | ----- | ------- | -------------------- |
| `id` | string (min 1) | ya    | —       | ID sesi (wa_sessions.id) |

**Query parameter**

| Nama     | Tipe                     | Wajib | Default | Keterangan |
| -------- | ------------------------ | ----- | ------- | ---------- |
| `limit`  | integer (min 1, max 100) | tidak | 20      | —          |
| `cursor` | string                   | tidak | —       | —          |

**Respons `200`** — Room chat urut dari pesan terbaru

```ts
{
  items: {
    id: string
    sessionId: string
    waJid: string
    waJidAlt: string | null
    lastMessageAt: string | null
    unreadCount: integer (min 0)
    customerNames: string | null
  }[]
  nextCursor: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Query tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Events

#### `GET /v1/sessions/{id}/events` — Stream event real-time sesi (SSE)

Auth: `x-api-key`

Membuka `text/event-stream`. Gunakan `fetch` streaming (bukan `EventSource`) karena header auth tidak bisa dikirim lewat `EventSource`. Heartbeat `: ping` setiap 15 detik; koneksi diputus bila sesi dihapus. Daftar event dan bentuk `data` ada di bagian [Server-Sent Events](#server-sent-events).

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan               |
| ---- | -------------- | ----- | ------- | ------------------------ |
| `id` | string (min 1) | ya    | —       | ID sesi (wa_sessions.id) |

**Respons `200`** — Stream SSE berjalan sampai klien memutus koneksi

**Respons `401`** — API key tidak dikirim atau tidak valid

**Respons `404`** — Sesi tidak ditemukan

### Broadcasts

#### `POST /v1/broadcasts` — Buat broadcast teks, opsional terjadwal

Auth: `x-api-key`

**Body**

```ts
{
  recipients: {
    to: string (min 8, max 32)
    name?: string (max 255)
  }[]
  text: string (min 1, max 4096)
  minDelay: integer (min 10, max 600)
  maxDelay: integer (min 10, max 600)
  clientRef: string (min 1, max 191)
  sessionId: string (UUID wa_sessions.id)
  scheduledAt?: string (date-time)
}
```

**Respons `200`** — Broadcast duplikat (clientRef sudah pernah dipakai di sesi ini)

```ts
{
  broadcastId: string
  jobId: string
  status: 'draft' | 'scheduled' | 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
}
```

**Respons `202`** — Broadcast masuk antrean

```ts
{
  broadcastId: string
  jobId: string
  status: 'draft' | 'scheduled' | 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Sesi tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Data broadcast tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/broadcasts/{id}` — Status dan progres broadcast

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Broadcast beserta ringkasan penerima

```ts
{
  jobId: string | null
  status: 'draft' |
    'scheduled' |
    'pending' |
    'running' |
    'paused' |
    'done' |
    'failed' |
    'cancelled' |
    null
  total: number
  done: number
  sent: number
  failed: number
  skipped: number
  optedOut: number
  scheduledAt: string | null
  pauseReason: string | null
  recipients: {
    id: number
    to: string
    name: string | null
    status: 'pending' | 'sent' | 'failed' | 'skipped'
    error: string | null
  }
  ;[]
  id: string
  sessionId: string
  text: string
  clientRef: string | null
  startedAt: string | null
  finishedAt: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Broadcast tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/broadcasts/{id}/pause` — Jeda broadcast berjalan

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Broadcast dijeda; penerima tersisa tetap pending

```ts
{
  broadcastId: string
  status: 'draft' | 'scheduled' | 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Broadcast tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Broadcast tidak bisa dijeda pada status ini · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/broadcasts/{id}/start` — Mulai atau lanjutkan broadcast

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Broadcast masuk antrean

```ts
{
  broadcastId: string
  status: 'draft' | 'scheduled' | 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'cancelled'
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Broadcast tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Broadcast tidak bisa dimulai pada status ini · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

### Webhooks

#### `GET /v1/webhooks` — Daftar endpoint webhook

Auth: `x-api-key`

**Respons `200`** — Endpoint webhook tanpa secret

```ts
{
  items: {
    id: string
    url: string
    events: "message.status" | "message.received" | "session.status"[]
    active: boolean
    createdAt: string
  }[]
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/webhooks` — Daftarkan endpoint webhook

Auth: `x-api-key`

**Body**

```ts
{
  url: string (uri)
  events: "message.status" | "message.received" | "session.status"[]
  active?: boolean
}
```

**Respons `201`** — Endpoint dibuat; secret hanya tampil sekali

```ts
{
  id: string
  url: string
  events: "message.status" | "message.received" | "session.status"[]
  active: boolean
  createdAt: string
  secret: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — URL atau event tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `PATCH /v1/webhooks/{id}` — Perbarui endpoint webhook

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Body**

```ts
{
  url?: string (uri)
  events?: "message.status" | "message.received" | "session.status"[]
  active?: boolean
}
```

**Respons `200`** — Endpoint diperbarui

```ts
{
  id: string
  url: string
  events: "message.status" | "message.received" | "session.status"[]
  active: boolean
  createdAt: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Endpoint tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — URL atau event tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `DELETE /v1/webhooks/{id}` — Hapus endpoint webhook

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `204`** — Endpoint dihapus

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Endpoint tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `GET /v1/webhooks/{id}/deliveries` — Log pengiriman endpoint webhook

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Query parameter**

| Nama     | Tipe                     | Wajib       | Default  | Keterangan |
| -------- | ------------------------ | ----------- | -------- | ---------- |
| `limit`  | integer (min 1, max 100) | tidak       | 20       | —          |
| `cursor` | string                   | tidak       | —        | —          |
| `status` | "pending"                | "delivered" | "failed" | tidak      | —   | —   |

**Respons `200`** — Halaman log pengiriman

```ts
{
  items: {
    id: string
    endpointId: string
    eventType: string
    status: "pending" | "delivered" | "failed"
    attempts: integer (min 0)
    nextAttemptAt: string
    lastStatusCode: integer | null
    lastError: string | null
    createdAt: string
  }[]
  nextCursor: string | null
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Endpoint tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `422`** — Query tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

#### `POST /v1/webhooks/{id}/rotate-secret` — Rotasi secret endpoint webhook

Auth: `x-api-key`

**Path parameter**

| Nama | Tipe           | Wajib | Default | Keterangan  |
| ---- | -------------- | ----- | ------- | ----------- |
| `id` | string (min 1) | ya    | —       | ID resource |

**Respons `200`** — Secret baru; hanya tampil sekali

```ts
{
  secret: string
}
```

**Respons `401`** — API key tidak dikirim atau tidak valid · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `404`** — Endpoint tidak ditemukan · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `429`** — Rate limit terlampaui · `{ error: { code, message } }` (lihat [Format error](#format-error))

**Respons `500`** — Kesalahan internal · `{ error: { code, message } }` (lihat [Format error](#format-error))

## Server-Sent Events

`GET /v1/sessions/{id}/events` membuka stream `text/event-stream` (auth: `x-api-key`). Gunakan `fetch` streaming, bukan `EventSource`, karena header auth tidak bisa dikirim lewat `EventSource`.

```text
id: 0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65
event: message.received
data: {...}

: ping

```

- Heartbeat komentar `: ping` setiap 15 detik; koneksi diputus bila sesi dihapus.
- `id` event stabil dan bisa dipakai untuk deduplikasi.

| `event`            | `data`                                                     |
| ------------------ | ---------------------------------------------------------- |
| `session.status`   | `{ status, phoneNumber \| null, lastConnectedAt \| null }` |
| `session.qr`       | `{ qr \| null, status }`                                   |
| `message.received` | `{ message: RoomMessage }`                                 |
| `message.status`   | `{ messageId, sessionId, status, occurredAt }`             |

## Webhook keluar

- Event: `message.status`, `message.received`, `session.status`, `broadcast.recipient`, `broadcast.status`.
- URL wajib HTTPS. `http://` hanya untuk `localhost`/loopback, atau IP privat (10/8, 172.16/12, 192.168/16) bila `WEBHOOK_ALLOW_HTTP_PRIVATE=true`.
- Secret 64 karakter hex dibuat server, hanya tampil saat create/rotate.
- Header: `X-Event-Id` (stabil antar retry) dan `X-Signature: sha256=<HMAC-SHA256(body, secret endpoint)>`.
- Timeout 10 detik, maksimal 3 percobaan (jeda 10 lalu 20 detik), setelah itu `failed`. Balasan non-2xx dianggap gagal; endpoint nonaktif langsung `failed`.
- Penerima sebaiknya idempoten berdasarkan `X-Event-Id`.
- `broadcast.recipient` memakai kunci idempotensi `(broadcast_id, recipient_id)`; `payload.id` juga stabil untuk dedupe lintas retry.
- `message.status` menyertakan `to` (JID) dan `phone` (E.164 tanpa `+`); keduanya `null` bila JID pesan tidak tersedia.
- `sent` berarti Baileys berhasil mengirim pesan, bukan `delivered`/`read`. Status final per penerima dan ringkasan broadcast tetap diambil dari `GET /v1/broadcasts/{id}`; webhook hanya notifikasi.
- `broadcast.status` dipancarkan untuk status terminal `done`, `paused`, `failed`, dan `cancelled`; transisi massal seperti skip opt-out atau batas harian tidak memancarkan event per penerima.

```json
{
  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f63",
  "type": "broadcast.recipient",
  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "data": {
    "broadcast_id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",
    "recipient_id": 42,
    "to": "628123456789@s.whatsapp.net",
    "phone": "628123456789",
    "ref": "crm-8821",
    "status": "failed",
    "message_id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f62",
    "error": "connection closed",
    "occurred_at": "2026-11-22T03:00:05.000Z"
  }
}
```

```json
{
  "id": "0199f0c4-6f0e-7f0a-9a0b-1b2c3d4e5f65",
  "type": "broadcast.status",
  "session_id": "01a1ddfa-295a-7557-9bd3-00293fdc047b",
  "data": {
    "broadcast_id": "01a1ddfa-295a-7557-9bd3-00293fdc047c",
    "status": "done",
    "total": 2,
    "sent": 1,
    "failed": 1,
    "skipped": 0,
    "opted_out": 0,
    "pause_reason": null,
    "occurred_at": "2026-11-22T03:00:06.000Z"
  }
}
```

## Catatan implementasi

- `:id` pada path sesi adalah `wa_sessions.id` (UUID), bukan `public_id`. `publicId` hanya label tampilan di response. Path `:id` conversation, broadcast, dan webhook juga UUID.
- Nomor WhatsApp pada body dikirim dalam format internasional tanpa `+` (contoh `6281234567890`); JID `...@s.whatsapp.net` muncul di payload inbound/webhook.
- Semua endpoint berada di bawah prefiks `/v1`.
- `GET /v1/health` publik dan mengembalikan status dependensi + metrik; jangan dipakai untuk health check yang butuh auth.
- Referensi interaktif: `GET /v1/docs` (Scalar) dan `GET /v1/openapi.json`.
