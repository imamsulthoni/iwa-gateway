# Panduan Docker (produksi)

Panduan lengkap membangun dan menjalankan WA Bot Console sebagai stack Docker: build image, siapkan env, migrasi database, sampai troubleshooting. Untuk menjalankan development lokal, cukup lihat [README](./README.md#mulai-dari-clone-bersih).

## Isi

- [Prasyarat](#prasyarat)
- [File yang terlibat](#file-yang-terlibat)
- [Arsitektur image](#arsitektur-image)
- [1. Siapkan `.env.prod`](#1-siapkan-envprod)
- [2. Validasi konfigurasi](#2-validasi-konfigurasi)
- [3. Build image](#3-build-image)
- [4. Jalankan stack](#4-jalankan-stack)
- [5. Migrasi dan seed](#5-migrasi-dan-seed)
- [6. Verifikasi](#6-verifikasi)
- [Perintah harian](#perintah-harian)
- [Dua peran file env](#dua-peran-file-env)
- [Nilai yang dibakar ke image](#nilai-yang-dibakar-ke-image)
- [Troubleshooting](#troubleshooting)
- [Keamanan](#keamanan)

## Prasyarat

- Docker Engine + Docker Compose v2 (diuji dengan Docker 29.6.2 dan Compose v5.5.1).
- BuildKit aktif. Default pada Docker modern; `RUN --mount=type=cache` di Dockerfile gagal bila dimatikan.
- Repo sudah di-clone, dan `pnpm-lock.yaml` sinkron dengan `package.json` di semua package.

Semua perintah dijalankan dari root repo.

## File yang terlibat

| File                      | Peran                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| `Dockerfile`              | Multi-stage: `base` → `deps` → `build` → `runtime`.                        |
| `docker-compose.prod.yml` | Stack produksi: `mysql`, `redis`, `api`, `worker`, plus job `migrate`.     |
| `.dockerignore`           | Menjaga `.env*`, `node_modules`, `dist`, `docs`, `.git` keluar dari image. |
| `.env.prod.example`       | Template env produksi; salin ke `.env.prod`.                               |
| `.env.prod`               | Env asli (secret). Di-gitignore, tidak pernah masuk image.                 |
| `docker-compose.yml`      | Stack development (MySQL + Redis saja, port di-publish). Jangan dicampur.  |

## Arsitektur image

Satu Dockerfile, satu image hasil akhir, dipakai dua service:

```
base    node:24.22.1-bookworm-slim + pnpm 12.21.0
  │
deps    copy lockfile + 4 package.json → pnpm install --frozen-lockfile
  │
build   ARG VITE_API_BASE_URL → COPY . . → pnpm build
  │     hasil: packages/backend/dist/api.js, dist/worker.js, packages/web/dist
  │
runtime NODE_ENV=production, copy node_modules + packages, USER node
        CMD node packages/backend/dist/api.js
```

Poin yang perlu diketahui:

- `api` dan `worker` memakai image yang sama; bedanya hanya `command` di compose. Worker dijalankan dengan `node packages/backend/dist/worker.js`.
- `devDependencies` sengaja ikut ke runtime karena job `migrate` dan `db:seed:key` dijalankan dari image yang sama (`drizzle-kit`, `tsx`). Konsekuensinya image sekitar 1 GB — trade-off yang disengaja agar tidak perlu image kedua.
- Image jalan sebagai user `node` (uid 1000), bukan root.
- `.env` tidak pernah ada di dalam image; konfigurasi sepenuhnya dari environment container.

## 1. Siapkan `.env.prod`

```powershell
Copy-Item .env.prod.example .env.prod
```

Isi minimal yang wajib:

```dotenv
MYSQL_ROOT_PASSWORD=<acak, alfanumerik>
MYSQL_USER=wbc
MYSQL_PASSWORD=<acak, alfanumerik>
API_PORT=8467
DATABASE_URL=mysql://wbc:<password-sama-dengan-MYSQL_PASSWORD>@mysql:3306/wa_console
REDIS_URL=redis://redis:6379
AUTH_ENC_KEY=<openssl rand -base64 32>
VITE_API_BASE_URL=http://<alamat-yang-dijangkau-browser>:8467
```

Aturan yang tidak boleh dilanggar:

- Host di `DATABASE_URL`/`REDIS_URL` adalah nama service compose (`mysql`, `redis`), **bukan** `localhost`. Di dalam container, `localhost` menunjuk container itu sendiri.
- Path database harus `wa_console`, karena `MYSQL_DATABASE` dipaku di compose.
- Password harus sama antara `MYSQL_PASSWORD` dan bagian password di `DATABASE_URL`.
- Hindari `$`, `+`, `/`, `@`, `:` di password — `$` dimakan interpolasi compose, sisanya merusak URL MySQL. Alfanumerik 24+ karakter aman.

Membuat nilai acak:

```powershell
# AUTH_ENC_KEY (catat di password manager; kalau hilang, semua sesi harus scan QR ulang)
openssl rand -base64 32

# password DB
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
```

## 2. Validasi konfigurasi

Selalu lakukan ini sebelum build. Murah dan menangkap hampir semua kesalahan env:

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
```

Exit code `0` berarti interpolasi `${...}` terpenuhi. Untuk melihat hasil resolve lengkap (termasuk `build.args` dan `env_file`):

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml config
```

## 3. Build image

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml build
```

Hasilnya dua image (isinya identik, beda hanya `command` saat runtime):

```
wa-bot-console-prod-api:latest
wa-bot-console-prod-worker:latest
```

Varian yang sering dipakai:

```powershell
# hanya satu service
docker compose --env-file .env.prod -f docker-compose.prod.yml build api

# paksa ulang semua layer
docker compose --env-file .env.prod -f docker-compose.prod.yml build --no-cache

# output build lebih detail
docker compose --env-file .env.prod -f docker-compose.prod.yml build --progress plain

# build sekaligus nyalakan
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Cache: layer `deps` dipakai ulang selama `pnpm-lock.yaml` dan keempat `package.json` tidak berubah. Perubahan kode saja hanya mengulang stage `build` ke atas.

Kalau ingin membangun langsung tanpa compose:

```powershell
docker build -f Dockerfile --target runtime -t wa-bot-console-prod:local .
```

Jalur ini **tidak** mengisi `VITE_API_BASE_URL` (arg-nya dikirim oleh compose). Oper manual bila perlu:

```powershell
docker build -f Dockerfile --target runtime `
  --build-arg "VITE_API_BASE_URL=$env:VITE_API_BASE_URL" `
  -t wa-bot-console-prod:local .
```

## 4. Jalankan stack

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Yang dijalankan: `mysql`, `redis`, `api`, `worker`. Service `api` dan `worker` menunggu `mysql` dan `redis` berstatus healthy lebih dulu. Service `migrate` tidak ikut karena berada di profile `tools`.

Cek status:

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml ps
```

## 5. Migrasi dan seed

Dijalankan setelah `mysql` healthy, dan setelah build:

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate
```

Buat API key admin pertama. **Key hanya tampil sekali**, simpan di tempat aman:

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm migrate pnpm db:seed:key
```

`run` membangun image service tersebut bila belum ada, jadi urutannya tidak wajib setelah `build`.

## 6. Verifikasi

```powershell
# API hidup? (pakai curl.exe, bukan alias curl PowerShell)
curl.exe http://localhost:8467/v1/health
```

Harapan: `status: ok` (atau `degraded` dengan `checks` yang menjelaskan penyebab). Bila `degraded`, lihat log:

```powershell
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f worker
```

Verifikasi `VITE_API_BASE_URL` benar-benar masuk ke bundle web:

```powershell
$url = (Select-String -Path .env.prod -Pattern '^VITE_API_BASE_URL=').Line.Split('=', 2)[1]
docker run --rm --entrypoint sh wa-bot-console-prod-api -c "grep -rl '$url' packages/web/dist || echo 'URL tidak ditemukan di bundle'"
```

Kalau muncul "URL tidak ditemukan", berarti build arg kosong dan dashboard akan gagal memanggil API — build-nya sendiri tetap sukses, jadi tidak ada error yang menuntun.

Pastikan tidak ada secret yang bocor ke image:

```powershell
docker run --rm --entrypoint sh wa-bot-console-prod-api -c "ls -a /app | grep '^\.env' || echo 'aman: tidak ada .env di image'"
```

## Perintah harian

```powershell
# log
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f api

# restart satu service setelah deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml restart worker

# matikan, volume tetap utuh
docker compose --env-file .env.prod -f docker-compose.prod.yml down

# HATI-HATI: menghapus volume mysql_data + redis_data (sesi, creds, riwayat hilang)
docker compose --env-file .env.prod -f docker-compose.prod.yml down -v
```

Agar tidak mengetik `--env-file` terus-menerus:

```powershell
$env:COMPOSE_ENV_FILES = '.env.prod'
docker compose -f docker-compose.prod.yml build
```

## Dua peran file env

Ini sumber kebingungan paling sering. `.env.prod` dipakai dua kali, untuk tujuan berbeda:

| Mekanisme              | Kapan                 | Gunanya                                                  |
| ---------------------- | --------------------- | -------------------------------------------------------- |
| `--env-file .env.prod` | sebelum container ada | Mengisi `${...}` di file compose, termasuk `build.args`. |
| `env_file:` di service | saat container jalan  | Menyuntik environment ke dalam container `api`/`worker`. |

Keduanya menunjuk file yang sama, jadi nilai build dan runtime tidak bisa berbeda. `env_file:` memakai `${APP_ENV_FILE:-.env.prod}`, sehingga bisa diarahkan ke file lain bila perlu.

Urutan prioritas yang perlu diingat: environment OS menang atas `--env-file` saat interpolasi; `environment:` di compose menang atas `env_file:` di dalam container.

## Nilai yang dibakar ke image

Hanya `VITE_API_BASE_URL`. Alasannya, Vite membaca variabel `VITE_*` saat `pnpm build`, bukan saat runtime, sehingga nilainya masuk permanen ke `packages/web/dist`. Mengubah `VITE_API_BASE_URL` di `.env.prod` setelah build **tidak** berefek sampai image dibangun ulang.

Konsekuensi lain: URL haruslah alamat yang bisa dijangkau browser pengguna, bukan `http://api:8467` (nama itu hanya berlaku di jaringan internal Docker).

Semua secret (`AUTH_ENC_KEY`, `DATABASE_URL`, `REDIS_URL`, `MYSQL_*`) masuk lewat environment runtime. Jangan pernah mengoper secret melalui `--build-arg`; nilainya tercatat di metadata image dan terbaca lewat `docker history`.

## Troubleshooting

| Gejala                                                | Penyebab                                                                     | Solusi                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `required variable MYSQL_PASSWORD is missing a value` | `--env-file .env.prod` tidak disebut                                         | Tambahkan flag tersebut; ini juga mengenai perintah `build` dan `run` |
| `env file ... not found`                              | `APP_ENV_FILE` menunjuk file yang tidak ada                                  | Hapus `APP_ENV_FILE` dari env atau arahkan ke file yang benar         |
| `Env tidak valid: REDIS_URL, AUTH_ENC_KEY`            | Job `migrate` memvalidasi env penuh (drizzle config memanggil `validateEnv`) | Lengkapi `.env.prod`; jangan hanya mengisi `DATABASE_URL`             |
| `AUTH_ENC_KEY harus 32 byte base64`                   | Panjang key salah                                                            | Buat ulang dengan `openssl rand -base64 32`                           |
| `ECONNREFUSED 127.0.0.1:3306`                         | `DATABASE_URL` masih `localhost`                                             | Ganti host ke `mysql` (dan `redis` untuk `REDIS_URL`)                 |
| api restart terus / cepat mati                        | Env runtime tidak lengkap                                                    | `docker compose ... logs api`, cek nama variabel di pesan error       |
| `ERR_PNPM_OUTDATED_LOCKFILE`                          | `pnpm-lock.yaml` tidak sinkron                                               | `pnpm install` di host, lalu build ulang                              |
| `RUN --mount=type=cache` tidak dikenali               | BuildKit off                                                                 | Aktifkan BuildKit, atau build dengan `docker buildx build`            |
| Dashboard gagal memanggil API                         | `VITE_API_BASE_URL` kosong saat build                                        | Isi di `.env.prod`, build ulang, verifikasi dengan langkah di atas    |
| `port is already allocated`                           | Stack dev (`docker-compose.yml`) masih jalan                                 | `docker compose down` stack dev dulu, atau ubah `API_PORT`            |
| Healthcheck `api` gagal terus                         | `PORT` container tidak sama dengan port yang di-publish                      | Biarkan `PORT` mengikuti `API_PORT`; jangan set manual berbeda        |

## Keamanan

- Port `api` di-publish ke host. Docker menembus `ufw`, jadi port itu benar-benar terbuka ke jaringan — batasi lewat firewall atau taruh reverse proxy (nginx/Caddy) di depannya untuk TLS.
- `mysql` dan `redis` tidak mem-publish port; keduanya hanya bisa diakses dari jaringan internal compose.
- `AUTH_ENC_KEY` mengenkripsi auth state Baileys. Simpan cadangannya di luar server. Menggantinya setelah ada sesi membuat semua creds tidak bisa didekripsi dan semua nomor harus scan QR ulang.
- `MYSQL_ROOT_PASSWORD` hanya dibaca saat volume `mysql_data` pertama kali dibuat. Mengubahnya di `.env.prod` setelahnya tidak mengganti password yang sudah ada di database.
- Jangan skalakan `worker` lebih dari satu instance sebelum paham mekanisme lock + reconcile di README; satu worker memegang socket Baileys tiap sesi.
- `.env.prod` sudah tercakup `.gitignore` dan `.dockerignore`. Jangan menghapus baris-baris tersebut.
- Dashboard belum dilayani container. Untuk sementara jalankan di host (`pnpm build && pnpm start:web`, port 8469) dengan `CORS_ORIGIN` yang sesuai, sampai reverse proxy ditambahkan.
