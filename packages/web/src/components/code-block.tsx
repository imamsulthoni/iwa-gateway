import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '../design-system'
import type { CodeSample } from '../lib/api-guide'

type CodeBlockProps = {
  samples: readonly CodeSample[]
  className?: string
}

export function CodeBlock({ samples, className }: CodeBlockProps) {
  const [activeId, setActiveId] = useState(samples[0]?.id ?? 'fetch')
  const [copied, setCopied] = useState(false)
  const active = samples.find((sample) => sample.id === activeId) ?? samples[0]

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  if (!active) return null

  async function copy() {
    if (!active) return
    try {
      await navigator.clipboard.writeText(active.code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-card border border-inverse-line bg-inverse',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-inverse-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {samples.length > 1 ? (
            samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                aria-pressed={sample.id === active.id}
                onClick={() => setActiveId(sample.id)}
                className={cn(
                  'shrink-0 rounded-chip px-2 py-1 font-data text-[9.5px] tracking-[0.6px] uppercase transition',
                  sample.id === active.id
                    ? 'bg-inverse-surface text-white'
                    : 'text-inverse-faint hover:text-inverse-soft',
                )}
              >
                {sample.label}
              </button>
            ))
          ) : (
            <span className="px-2 font-data text-[9.5px] tracking-[1.2px] text-inverse-faint uppercase">
              {active.label}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Kode tersalin' : 'Salin kode'}
          className="flex shrink-0 items-center gap-1.5 rounded-chip px-2 py-1 font-data text-[9.5px] tracking-[0.6px] text-inverse-faint uppercase transition hover:text-white"
        >
          {copied ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          {copied ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-data text-[11px] leading-[1.7] text-inverse-text">
        <code>{active.code}</code>
      </pre>
    </div>
  )
}
