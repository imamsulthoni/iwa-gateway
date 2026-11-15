import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, cn } from '../design-system'

type ModalProps = {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  className,
}: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4">
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className={cn(
          'flex max-h-[calc(100vh-32px)] w-full max-w-[520px] flex-col overflow-auto rounded-[18px] bg-surface p-7',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[20px] font-semibold tracking-[-0.6px] text-ink">{title}</h2>
            {description ? <p className="text-small text-ink-soft">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex size-[26px] shrink-0 items-center justify-center rounded-pill bg-bg text-ink-soft transition hover:text-ink"
          >
            <X className="size-[13px]" aria-hidden />
          </button>
        </div>
        <div className="mt-[22px]">{children}</div>
        {footer ? (
          <div className="mt-5 flex items-center justify-between gap-3">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Hapus',
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <span />
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Batal
            </Button>
            <Button variant="destructive" onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </Button>
          </div>
        </>
      }
    >
      <p className="text-body text-ink-soft">{message}</p>
    </Modal>
  )
}