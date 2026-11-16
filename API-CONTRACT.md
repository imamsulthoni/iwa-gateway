# API Contract — WA Bot Service

Kontrak HTTP untuk `wa-bot-service`. Dokumen ini adalah acuan integrasi; perubahan bentuk request/response wajib memperbarui file ini.

- Versi API: `0.1.0` (sama dengan `APP_VERSION`)
- Base URL lokal: `http://localhost:8467`
- Tidak ada prefix path (`/api/v1/...` tidak dipakai)
- Semua body request dan response berformat JSON (`content-type: application/json`), kecuali `204 No Content`

---

## 1. Autentikasi

Ada dua skema, dipilih lewat header:

| Skema         | Header                          | Dipakai                       |
| ------------- | ------------------------------- | ----------------------------- |
| API key admin | `x-api-key: <key>`              | Semua endpoint terproteksi    |
| Token sesi    | `Authorization: Bearer <token>` | Hanya endpoint pesan per sesi |

- API key dibuat sekali lewat `pnpm db:seed:key` (plaintext hanya tampil sekali).
- Token sesi dibuat saat `POST /sessions` dan saat rotasi `POST /sessions/:id/token`; server hanya menyimpan hash SHA-256, jadi token **tidak bisa dilihat ulang**.
- Jika `x-api-key` dikirim, API key dipakai dan `Authorization` diabaikan.

| Endpoint                                                    | `x-api-key` | `Bearer token`     |
| ----------------------------------------------------------- | ----------- | ------------------ |
| `GET /`                                                     | publik      | —                  |
| `GET /stats`                                                | wajib       | —                  |
| `/sessions`, `/sessions/:id/*`                              | wajib       | —                  |
| `POST /sessions/:id/messages`, `GET /sessions/:id/messages` | boleh       | boleh (alternatif) |
| `/messages`, `/messages/:id`                                | wajib       | —                  |

Tanpa kredensial valid:

```json
{ "error": { "code": "UNAUTHORIZED", "message": "API key wajib dikirim" } }
```

Pesan lain yang mungkin: `API key tidak valid`, `API key atau token sesi wajib dikirim`, `Token sesi tidak valid`.

---

## 2. Rate limit

- Diterapkan pada semua endpoint terproteksi, window tetap 60 detik di Redis.
- Batas: `RATE_LIMIT_PER_MIN` (default `240`).
- Kunci: per API key (`rl:key:<apiKeyId>:<window>`) dan per sesi (`rl:sess:<sessionId>:<window>`) untuk path yang punya `:id`.
- Saat terlampaui: `429` dengan header `Retry-After: 60`.

```json
{ "error": { "code": "RATE_LIMITED", "message": "Terlalu banyak permintaan" } }
```

---

## 3. Format error

Semua error memakai bentuk:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Data tidak valid" } }
```

| HTTP | `code`             | Kapan                                                        |
| ---- | ------------------ | ------------------------------------------------------------ |
| 400  | `VALIDATION_ERROR` | Domain error tanpa pemetaan khusus                           |
| 401  | `UNAUTHORIZED`     | API key / token sesi tidak ada atau salah                    |
| 403  | `FORBIDDEN`        | Ditolak (belum dipakai di Fase 1)                            |
| 404  | `NOT_FOUND`        | Sesi/broadcast/pesan tidak ditemukan, endpoint tidak dikenal |
| 409  | `CONFLICT`         | Duplikat `publicId`/nomor, cancel saat sesi terhubung        |
| 422  | `VALIDATION_ERROR` | Body/query tidak lolos skema Zod                             |
| 429  | `RATE_LIMITED`     | Rate limit                                                   |
| 500  | `INTERNAL_ERROR`   | Error tak terduga (stack trace tidak pernah dikirim)         |

Validasi hanya mengembalikan **issue pertama**, misalnya:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Nomor harus 8-15 digit tanpa spasi atau tanda baca"
  }
}
```

---

## 4. Enum dan tipe umum

**Status sesi** (`session.status`):

| Nilai          | Label UI      | Arti                                                    |
| -------------- | ------------- | ------------------------------------------------------- |
| `created`      | Dibuat        | Baru dibuat, belum ada socket/QR                        |
| `qr_pending`   | Menunggu QR   | Worker sudah membuat QR, menunggu scan                  |
| `connecting`   | Menghubungkan | Socket berjalan / pairing code diminta                  |
| `connected`    | Terhubung     | Perangkat tertaut dan siap kirim                        |
| `disconnected` | Terputus      | Socket berhenti (pairing dibatalkan atau koneksi putus) |
| `logged_out`   | Keluar        | Perangkat dilepas; auth state dihapus                   |

**Status pesan**: `queued` → `sent` → `delivered` → `read`, atau `failed`.

**Status broadcast**: `pending`, `running`, `done`, `failed`, `cancelled`.
**Status penerima broadcast**: `pending`, `sent`, `failed`.

**Waktu**: semua timestamp ISO-8601 UTC (`2026-11-16T03:21:09.000Z`). Nilai "hari ini" dihitung memakai `APP_TIMEZONE`.

**ID sesi**: parameter `:id` adalah `session.id` (UUID v7) dari response, **bukan** `publicId`. `publicId` hanya slug tampilan.

**Normalisasi nomor** (untuk `to`, `phoneNumber`):

- karakter non-digit dibuang;
- awalan `0` → `62`, awalan `8` → `62`, awalan `620` → `62`;
- hasil wajib 8–15 digit.

---

## 5. Health

### `GET /`

Publik, tanpa auth. Dipakai untuk readiness check.

**200**

```json
{
  "name": "wa-bot-service",
  "version": "0.1.0",
  "status": "ok",
  "checks": { "database": true, "redis": true }
}
```

`status` bernilai `ok` hanya jika database dan Redis keduanya sehat; selain itu `degraded` (tetap HTTP 200).

---

## 6. Statistik

### `GET /stats`

Auth: `x-api-key`.

**200**

```json
{
  "connectedSessions": 2,
  "todayMessages": 148,
  "totalMessages": 5321,
  "runningBroadcasts": 1
}
```

---

## 7. Sesi

Objek `SessionDto`:

```json
{
  "id": "019a1b2c-3d4e-7f80-9abc-def012345678",
  "publicId": "sales-a",
  "label": "Sales A",
  "phoneNumber": "628123456789",
  "status": "connected",
  "lastConnectedAt": "2026-11-16T03:21:09.000Z",
  "salesId": null,
  "agentId": "agent-01",
  "createdAt": "2026-11-15T10:00:00.000Z"
}
```

### `GET /sessions`

Auth: `x-api-key`. Maksimum 50 sesi terbaru.

**200**

```json
{ "items": [{ "id": "...", "publicId": "sales-a", "status": "connected" }], "nextCursor": null }
```

Item memakai bentuk `SessionDto` lengkap.

### `POST /sessions`

Auth: `x-api-key`. Membuat sesi baru.

```json
{
  "label": "Sales A",
  "publicId": "sales-a",
  "mode": "qr",
  "phoneNumber": "628123456789",
  "salesId": "sales-01",
  "agentId": "agent-01"
}
```

| Field         | Wajib          | Aturan                                                          |
| ------------- | -------------- | --------------------------------------------------------------- |
| `label`       | ya             | 1–255 karakter                                                  |
| `publicId`    | tidak          | `[A-Za-z0-9_-]{1,32}`, unik; dibuat otomatis 12 hex jika kosong |
| `mode`        | tidak          | `qr` (default) atau `pairing`                                   |
| `phoneNumber` | mode `pairing` | 8–15 digit, unik                                                |
| `salesId`     | tidak          | maks. 64 karakter                                               |
| `agentId`     | tidak          | maks. 64 karakter                                               |

**201**

```json
{
  "token": "W4k...base64url...",
  "session": { "id": "...", "publicId": "sales-a", "status": "created" }
}
```

Token sesi hanya muncul di response ini (simpan di sisi klien). Error: `409` untuk `publicId`/nomor duplikat, `422` untuk validasi.

### `GET /sessions/:id`

Auth: `x-api-key`. **200** `SessionDto`. **404** jika tidak ada.

### `DELETE /sessions/:id`

Auth: `x-api-key`. Menghapus sesi beserta auth state, pesan, dan broadcast (FK cascade). **204** tanpa body.

### `POST /sessions/:id/login`

Auth: `x-api-key`. Memulai ulang socket (dipakai setelah `logged_out` atau pairing dibatalkan). Status menjadi `connecting`; worker langsung dihubungi lewat Redis. **200** `SessionDto`.

### `POST /sessions/:id/cancel`

Auth: `x-api-key`. Membatalkan proses pairing yang sedang berjalan; QR dan auth sementara dihapus, status menjadi `disconnected`.

- **200** `SessionDto` (status `disconnected`).
- **409** jika sesi `connected` atau `logged_out`:

```json
{ "error": { "code": "CONFLICT", "message": "Sesi tidak sedang dalam proses pairing" } }
```

### `POST /sessions/:id/logout`

Auth: `x-api-key`. Logout sesi: worker melepas perangkat di WhatsApp (bila socket terbuka) lalu auth state, QR, dan state pairing dihapus; status menjadi `logged_out`. **200** `SessionDto`.

Jika worker sedang tidak berjalan, status tetap berubah dan auth lokal dibersihkan saat worker start; perangkat di HP perlu dilepas manual.

### `POST /sessions/:id/token`

Auth: `x-api-key`. Merotasi token sesi; token lama langsung tidak berlaku.

**200**

```json
{ "token": "token-baru-base64url", "session": { "id": "...", "status": "connected" } }
```

---

### 7.1. Status, QR, dan pairing

### `GET /sessions/:id/status`

Auth: `x-api-key`.

```json
{
  "status": "qr_pending",
  "statusLabel": "Menunggu QR",
  "phoneNumber": "628123456789",
  "salesId": "sales-01",
  "agentId": "agent-01"
}
```

### `GET /sessions/:id/qr`

Auth: `x-api-key`.

```json
{ "qr": "data:image/png;base64,iVBORw0KGgo...", "status": "qr_pending" }
```

`qr` adalah data-URL PNG atau `null` jika belum/tidak ada QR. QR baru dibuat worker secara berkala selama sesi belum tertaut.

### `GET /sessions/:id/pairing`

Auth: `x-api-key`. Kode pairing 8 digit dari Redis (TTL 600 detik).

```json
{ "code": "ABCD-1234", "status": "connecting" }
```

`code` bernilai `null` jika belum diminta atau sudah kedaluwarsa.

### `POST /sessions/:id/pairing`

Auth: `x-api-key`. Meminta kode pairing untuk nomor tertentu.

```json
{ "phoneNumber": "628123456789" }
```

**202**

```json
{ "code": null, "status": "connecting" }
```

Kode belum tersedia pada response ini: worker membuatnya saat QR berikutnya terbit. Ambil kode melalui `GET /sessions/:id/live` atau `GET /sessions/:id/pairing`. Error `409` jika nomor sudah dipakai sesi lain.

### `GET /sessions/:id/live`

Auth: `x-api-key`. **Rekomendasi untuk dashboard**: satu request untuk semua state, menggantikan polling terpisah ke `/sessions/:id`, `/status`, `/qr`, `/pairing`, dan `/broadcast/current`.

```json
{
  "session": { "id": "...", "publicId": "sales-a", "status": "qr_pending" },
  "qr": "data:image/png;base64,iVBORw0KGgo...",
  "pairingCode": null,
  "broadcast": {
    "jobId": null,
    "status": null,
    "total": 0,
    "done": 0,
    "sent": 0,
    "failed": 0,
    "recipients": []
  }
}
```

Field `session` memakai `SessionDto` lengkap. `broadcast` memakai bentuk `BroadcastCurrentDto` dan bernilai objek kosong di atas jika belum ada broadcast.

---

### 7.2. Alur pairing

**QR**

1. `POST /sessions` (`mode: "qr"`).
2. Poll `GET /sessions/:id/live` selama status `connecting`/`qr_pending` (dashboard: 3 detik).
3. Tampilkan `qr`; scan di WhatsApp.
4. Worker menutup stream dengan `515 restartRequired` setelah pairing sukses, lalu langsung menyambung ulang (bukan status terputus).
5. Status berubah `connected`, `qr` menjadi `null`.
6. Untuk membatalkan sebelum scan: `POST /sessions/:id/cancel`.

**Kode pairing**

1. `POST /sessions` (`mode: "pairing"`, sertakan `phoneNumber`).
2. `POST /sessions/:id/pairing` dengan nomor yang sama.
3. Ambil `pairingCode` dari `GET /sessions/:id/live` (TTL 600 detik).
4. Masukkan kode di WhatsApp → Perangkat tertaut → Tautkan dengan nomor telepon.
5. Status berubah `connected`.

---

## 8. Broadcast

### `POST /sessions/:id/broadcast`

Auth: `x-api-key`. Membuat broadcast dan meng-enqueue job worker. Response `202`.

```json
{
  "recipients": [{ "to": "628123456789", "name": "Budi" }, { "to": "628987654321" }],
  "text": "Halo, promo bulan ini...",
  "minDelay": 10,
  "maxDelay": 30,
  "referenceId": "promo-nov-2026"
}
```

| Field                  | Aturan                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `recipients`           | 1–1000 item; `to` 8–32 karakter; `name` maks. 255; nomor duplikat dalam satu request ditolak |
| `text`                 | 1–4096 karakter                                                                              |
| `minDelay`, `maxDelay` | integer detik, 10–600, `maxDelay >= minDelay`                                                |
| `referenceId`          | 1–191 karakter, unik per sesi                                                                |

**202**

```json
{ "broadcastId": "019a...", "jobId": "019a...", "status": "pending" }
```

Worker mengirim berurutan dengan jeda acak di antara dua batas di atas. Jika batas harian sesi tercapai (default 200 pesan terkirim per hari), sisa penerima ditandai `failed` dengan error `Batas harian tercapai`.

### `GET /sessions/:id/broadcast/current`

Auth: `x-api-key`. Broadcast terakhir untuk sesi tersebut.

```json
{
  "jobId": "019a...",
  "status": "running",
  "total": 25,
  "done": 10,
  "sent": 9,
  "failed": 1,
  "recipients": [
    {
      "id": 101,
      "to": "628123456789@s.whatsapp.net",
      "name": "Budi",
      "status": "sent",
      "error": null
    }
  ]
}
```

Jika belum ada broadcast, semua field angka `0`, `jobId`/`status` `null`, `recipients` `[]`.

### `POST /sessions/:id/broadcast/cancel`

Auth: `x-api-key`. Membatalkan broadcast `pending`/`running`.

**200**

```json
{ "broadcastId": "019a...", "status": "cancelled" }
```

Error: `404` jika belum ada broadcast, `422` jika status sudah final (`done`/`failed`/`cancelled`).

---

## 9. Pesan

Objek `MessageDto`:

```json
{
  "id": "019a...",
  "sessionId": "019a...",
  "to": "628123456789@s.whatsapp.net",
  "referenceId": "order-123",
  "body": "Halo",
  "status": "sent",
  "waMessageId": "3EB0...",
  "error": null,
  "customerName": "Budi",
  "createdAt": "2026-11-16T04:00:00.000Z",
  "deletedAt": null
}
```

`to` pada response selalu JID (`...@s.whatsapp.net`) atau `null` untuk pesan yang tidak punya tujuan.

### `POST /sessions/:id/messages`

Auth: `x-api-key` **atau** `Authorization: Bearer <token sesi>`. Meng-enqueue pengiriman teks.

```json
{
  "to": "628123456789",
  "referenceId": "order-123",
  "text": "Halo",
  "customerId": "cust-1",
  "customerName": "Budi"
}
```

| Field          | Wajib | Aturan                                          |
| -------------- | ----- | ----------------------------------------------- |
| `to`           | ya    | 8–32 karakter; nomor (dinormalisasi) atau JID   |
| `referenceId`  | ya    | 1–191 karakter; unik per sesi (idempotency key) |
| `text`         | ya    | 1–4096 karakter                                 |
| `customerId`   | tidak | maks. 64 karakter                               |
| `customerName` | tidak | maks. 255 karakter                              |

**202** untuk pesan baru:

```json
{ "message": { "id": "019a...", "status": "queued" }, "duplicate": false }
```

**200** jika `referenceId` yang sama sudah pernah dikirim:

```json
{ "message": { "id": "019a...", "status": "sent" }, "duplicate": true }
```

Request duplikat **tidak** membuat job baru.

### `GET /sessions/:id/messages`

Auth: `x-api-key` atau Bearer token sesi. Riwayat pesan keluar per sesi, terbaru dulu.

| Query    | Default | Aturan                                       |
| -------- | ------- | -------------------------------------------- |
| `limit`  | 20      | 1–100                                        |
| `cursor` | —       | opaque `nextCursor` dari response sebelumnya |

**200**

```json
{ "items": [{ "id": "019a...", "status": "sent" }], "nextCursor": "WzIwMjYt..." }
```

`nextCursor` bernilai `null` jika tidak ada halaman berikutnya.

### `GET /messages`

Auth: `x-api-key`. Riwayat lintas sesi (soft-deleted tidak ikut).

| Query       | Default | Aturan          |
| ----------- | ------- | --------------- |
| `limit`     | 50      | 1–100           |
| `sessionId` | —       | filter opsional |

**200** `{ "items": [...], "nextCursor": "..." }`.

Catatan: endpoint ini mengembalikan `nextCursor`, tetapi belum menerima parameter `cursor`; gunakan endpoint per sesi untuk paginasi.

### `DELETE /messages/:id`

Auth: `x-api-key`. Soft delete (`deletedAt` diisi) sehingga hilang dari daftar. **204**. **404** jika pesan tidak ada atau sudah dihapus.

---

## 10. Batas validasi (ringkas)

| Field                  | Batas                                                        |
| ---------------------- | ------------------------------------------------------------ |
| `publicId`             | `[A-Za-z0-9_-]{1,32}`                                        |
| `label`                | 1–255                                                        |
| `phoneNumber` / `to`   | 8–15 digit setelah normalisasi (schema menerima string 8–32) |
| `referenceId`          | 1–191                                                        |
| Teks pesan / broadcast | 1–4096                                                       |
| Penerima broadcast     | 1–1000                                                       |
| Delay broadcast        | 10–600 detik                                                 |
| `limit` pesan          | 1–100                                                        |
| Token sesi             | 32 byte acak, base64url                                      |

---

## 11. Contoh curl

```bash
API=http://localhost:8467
KEY=api-key-dari-seed

# buat sesi
curl -s -X POST "$API/sessions" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"label":"Sales A","publicId":"sales-a","mode":"qr"}'

# state dashboard (poll selama pairing)
curl -s "$API/sessions/<id>/live" -H "x-api-key: $KEY"

# kirim pesan
curl -s -X POST "$API/sessions/<id>/messages" \
  -H "x-api-key: $KEY" -H 'content-type: application/json' \
  -d '{"to":"628123456789","referenceId":"order-123","text":"Halo"}'

# batalkan pairing
curl -s -X POST "$API/sessions/<id>/cancel" -H "x-api-key: $KEY"

# logout (melepas perangkat di WhatsApp)
curl -s -X POST "$API/sessions/<id>/logout" -H "x-api-key: $KEY"
```

---

## 12. Catatan perilaku

- Pengiriman pesan dan broadcast bersifat asinkron: `202` berarti sudah masuk antrean, bukan sudah terkirim. Pantau `status` pesan/broadcast.
- `POST /sessions/:id/messages` idempoten terhadap `referenceId` selama record masih ada.
- Worker memegang socket WhatsApp; API hanya menulis DB, meng-enqueue job, dan memberi perintah start/stop lewat Redis. Efek perintah ke worker bersifat segera; reconcile 15 detik menjadi jaring pengaman.
- QR dan kode pairing berada di database/Redis, jadi aman dibaca endpoint mana pun; screenshot QR bukan bagian dari kontrak.
- Belum ada webhook, pesan masuk, media, atau multi-tenant di Fase 1.
