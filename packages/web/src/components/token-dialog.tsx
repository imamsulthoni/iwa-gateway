import { Copy, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../design-system'
import { formatDateTime } from '../lib/format'
import { Modal } from './dialogs'

type TokenDialogProps = {
  open: boolean
  token: string | null
  publicId: string
  createdAt: string | null
  onClose: () => void
}

export function TokenDialog({ open, token, publicId, createdAt, onClose }: TokenDialogProps) {
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)

  async function copy() {
    if (!token) return
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setSaved(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Token baru dibuat"
      className="max-w-[464px] p-[26px]"
      onClose={onClose}
    >
      <p className="text-small text-ink-soft">Salin sekarang. Token hanya ditampilkan satu kali.</p>

      <div className="mt-[18px] flex flex-col gap-2 rounded-xl bg-inverse p-[15px]">
        <div className="flex items-center justify-between gap-3">
          <p className="font-data text-[13px] tracking-[0.4px] break-all text-white">{token}</p>
          <button
            type="button"
            onClick={() => void copy()}
            aria-label="Salin token"
            className="text-inverse-strong transition hover:text-white"
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
        </div>
        <p className="font-data text-[9px] text-inverse-strong">
          {publicId} · dibuat {formatDateTime(createdAt)}
        </p>
      </div>

      {copied ? (
        <p className="mt-2 font-data text-[9px] text-green">Token disalin ke clipboard.</p>
      ) : null}

      <div className="mt-3.5 flex items-start gap-2 rounded-[9px] bg-amber-soft px-3 py-2.5">
        <TriangleAlert className="mt-px size-[13px] shrink-0 text-amber" aria-hidden />
        <p className="text-[10.5px] text-amber">
          Jika token hilang, lakukan rotasi ulang. Token lama langsung tidak berlaku.
        </p>
      </div>

      <label className="mt-4 flex items-center gap-[9px]">
        <input
          type="checkbox"
          checked={saved}
          onChange={(event) => setSaved(event.target.checked)}
          className="size-4 accent-ink"
        />
        <span className="text-small text-ink-soft">Saya sudah menyimpan token ini</span>
      </label>

      <div className="mt-5">
        <Button className="w-full" disabled={!saved} onClick={onClose}>
          Selesai
        </Button>
      </div>
    </Modal>
  )
}