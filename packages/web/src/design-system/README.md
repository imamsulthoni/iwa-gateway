# Design System — WA Platform Console

Sumber: pen.dev `wa-bot-platform.pen`, frame **Design System — Foundations** (v1.0) dan **Design System — Components**.

Layer ini **belum dipakai** oleh halaman yang ada (`src/routes/**`, `src/components/**`). Tampilan lama tetap memakai `components/ui.tsx` dan palet `slate/emerald`.

## Token

Didefinisikan sebagai `@theme` Tailwind v4 di [`tokens.css`](./tokens.css) dan diimpor dari `src/styles.css`.

| Kategori   | Token                                                                                                                                                                             | Utility                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Warna      | `bg`, `surface`, `surface-soft`, `line`, `line-strong`                                                                                                                            | `bg-bg`, `bg-surface`, `border-line`, …                |
| Teks       | `ink`, `ink-soft`, `ink-faint`                                                                                                                                                    | `text-ink`, `text-ink-soft`, `text-ink-faint`          |
| Status     | `green`, `amber`, `red`, `blue` + `*-soft`                                                                                                                                        | `text-green`, `bg-green-soft`, …                       |
| Inverse    | `inverse`, `inverse-surface`, `inverse-line`, `inverse-faint`, `inverse-muted`, `inverse-soft`, `inverse-strong`, `inverse-text`, `inverse-accent`, `accent-lime`, `accent-green` | `bg-inverse`, `text-inverse-soft`, … (panel gelap)     |
| Font       | `--font-body` (Inter), `--font-data` (JetBrains Mono)                                                                                                                             | `font-body`, `font-data`                               |
| Skala teks | `text-display`, `text-heading`, `text-title`, `text-body`, `text-small`, `text-value`, `text-note`, `text-help`, `text-label`, `text-caption`, `text-micro`                       | `text-body`, … (line-height & tracking sudah termasuk) |
| Radius     | `chip` 4, `control` 9, `field` 10, `card` 16, `pill` 99                                                                                                                           | `rounded-chip`, `rounded-card`, `rounded-pill`, …      |
| Ritme      | `base` 4, `stack` 14, `card` 22, `section` 24, `page` 40                                                                                                                          | `gap-stack`, `p-card`, `p-page`, …                     |

Catatan:

- `font-mono` bawaan Tailwind **tidak** diubah (mono teknis memakai `font-data`) agar halaman lama tidak berubah.
- Tidak ada shadow: kedalaman hanya lewat border 1px `border-line`.
- Font dimuat via `<link>` Google Fonts di `index.html`.

## Primitives

Semua di-export dari `@/design-system` (`packages/web/src/design-system/index.ts`).

| Komponen                                                                      | Varian                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Button`                                                                      | `primary`, `secondary`, `destructive`, `ghost`, `link`; size `sm`, `md`, `lg`, `icon` |
| `Badge`                                                                       | tone `neutral`, `success`, `warning`, `danger`, `info` (dot opsional)                 |
| `Chip`                                                                        | info non-status                                                                       |
| `Field` + `Input` / `Textarea` / `Select`                                     | default, focus (border ink), error (`aria-invalid`)                                   |
| `Card`, `CardHeader`, `Divider`                                               | media `surface` + border `line`, radius 16, padding 22                                |
| `PageHeader`, `SectionLabel`                                                  | eyebrow mono uppercase, judul 34, deskripsi 12.5                                      |
| `Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell` | hairline, tanpa zebra, row 50px                                                       |
| `Tabs`, `Tab`                                                                 | underline 2px, aktif `ink`                                                            |
| `NavItem`, `navItemClass`, `Breadcrumb`                                       | aktif blok hitam, nonaktif `ink-soft`                                                 |
| `Banner`                                                                      | tone `neutral`, `success`, `warning`, `danger`                                        |
| `Checkbox`, `Segmented`, `SearchInput`                                        | sesuai komponen 03/Controls                                                           |

TanStack `Link` memakai `navItemClass(active)` pada `className`/`activeProps`.

## Contoh

```tsx
import { Badge, Button, Card, Field, Input, PageHeader } from '@/design-system'

<PageHeader eyebrow="Nomor" title="Nomor" description="Kelola sesi WhatsApp." meta="v1.0" />
<Card className="space-y-stack">
  <Field label="Nomor tujuan">
    <Input placeholder="6281233448890" />
  </Field>
  <Button>Mulai broadcast</Button>
  <Badge tone="success">Terhubung</Badge>
</Card>
```

`@/` saat ini belum dikonfigurasi sebagai alias; gunakan path relatif
(`../design-system`) sampai alias ditambahkan ke `tsconfig` dan `vite.config.ts`.
