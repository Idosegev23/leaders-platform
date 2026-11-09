'use client'

/**
 * Small shared building blocks for the campaigns screens. They reuse the Hub
 * tokens (brand-*, wizard-*) so the module looks like the rest of the app.
 */
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ApiError } from './client-api'
import { heStatus } from '@/lib/campaigns/domain/state-machines'

// ── Status badge: colour AND text, never colour alone ──────────────────────
const TONE: Record<string, 'neutral' | 'info' | 'wait' | 'good' | 'warn' | 'bad'> = {
  draft: 'neutral', planning: 'info', recruiting: 'info', active: 'good', reporting: 'info', closed: 'neutral', cancelled: 'bad',
  proposed: 'neutral', internal_review: 'wait', client_review: 'wait', approved: 'good', changes_requested: 'warn', rejected: 'bad', withdrawn: 'neutral',
  not_invited: 'neutral', invited: 'wait', accepted: 'good', declined: 'bad', completed: 'good',
  awaiting_submission: 'neutral', submitted: 'wait', publication_reported: 'wait', publication_verified: 'good',
  open: 'info', in_progress: 'wait', done: 'good',
  planned: 'neutral', committed: 'info', actual: 'good',
  not_required: 'neutral', required: 'warn', preparing: 'info', shipped: 'wait', delivered: 'good', exception: 'bad',
  pending: 'wait', sending: 'wait', sent: 'good', dev_not_sent: 'warn', failed: 'warn', dead: 'bad', uncertain: 'warn', skipped: 'neutral', running: 'wait',
  reported: 'wait', verified: 'good', revoked: 'bad',
}
const TONE_CLASS = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  wait: 'bg-amber-50 text-amber-900 border-amber-200',
  good: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warn: 'bg-orange-50 text-orange-900 border-orange-200',
  bad: 'bg-rose-50 text-rose-800 border-rose-200',
}
const EXTRA_LABEL: Record<string, string> = {
  sending: 'בשליחה', sent: 'נשלחה', dev_not_sent: 'לא נשלחה — סביבת פיתוח', failed: 'נכשלה, ינסה שוב', dead: 'נכשלה סופית',
  uncertain: 'לא ודאי שנשלחה', skipped: 'דולג', running: 'רץ', revoked: 'בוטלה',
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = TONE[status] ?? 'neutral'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', TONE_CLASS[tone], className)}>
      <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-slate-400': tone === 'neutral', 'bg-sky-500': tone === 'info', 'bg-amber-500': tone === 'wait',
        'bg-emerald-500': tone === 'good', 'bg-orange-500': tone === 'warn', 'bg-rose-500': tone === 'bad',
      })} />
      {label ?? EXTRA_LABEL[status] ?? heStatus(status)}
    </span>
  )
}

// ── Layout pieces ──────────────────────────────────────────────────────────
export function Panel({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-wizard-border bg-white p-4 sm:p-5', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-bold text-foreground">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-wizard-border bg-brand-pearl/40 p-6 text-center">
      <p className="font-semibold text-foreground">{title}</p>
      {children && <div className="mt-1 text-sm text-wizard-text-secondary">{children}</div>}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: React.ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', warn: 'border-amber-300 bg-amber-50 text-amber-900', bad: 'border-rose-200 bg-rose-50 text-rose-900', good: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone]
  return <div role={tone === 'bad' ? 'alert' : 'status'} className={cn('rounded-xl border px-4 py-3 text-sm', cls)}>{children}</div>
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'warn' | 'bad' | 'good' }) {
  return (
    <div className={cn('rounded-xl border bg-white p-3', tone === 'bad' ? 'border-rose-200' : tone === 'warn' ? 'border-amber-300' : 'border-wizard-border')}>
      <div className="text-xs text-wizard-text-secondary">{label}</div>
      <div className={cn('mt-1 text-xl font-bold', tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-800' : 'text-foreground')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-wizard-text-secondary">{hint}</div>}
    </div>
  )
}

// ── Form controls (label + control, accessible) ────────────────────────────
const controlCls = 'w-full rounded-xl border border-wizard-border bg-white px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-brand-primary focus-visible:ring-[3px] focus-visible:ring-brand-primary/15 disabled:bg-brand-pearl disabled:opacity-60'

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-wizard-text-secondary">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-wizard-text-tertiary">{hint}</p>}
      {error && <p className="text-xs text-rose-700" role="alert">{error}</p>}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput({ className, ...p }, ref) {
  return <input ref={ref} className={cn(controlCls, 'h-10', className)} {...p} />
})
export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(controlCls, 'min-h-[80px]', className)} {...p} />
})
export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function SelectInput({ className, ...p }, ref) {
  return <select ref={ref} className={cn(controlCls, 'h-10', className)} {...p} />
})

export function Btn({ tone = 'primary', size = 'md', className, busy, children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'good'; size?: 'sm' | 'md'; busy?: boolean }) {
  const t = {
    primary: 'bg-brand-primary text-white hover:bg-brand-primary/90',
    secondary: 'border border-wizard-border bg-white text-foreground hover:bg-brand-pearl',
    danger: 'bg-rose-700 text-white hover:bg-rose-800',
    good: 'bg-emerald-700 text-white hover:bg-emerald-800',
    ghost: 'text-wizard-text-secondary hover:bg-brand-pearl',
  }[tone]
  return (
    <button
      type={p.type ?? 'button'}
      className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-primary/25 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm', t, className)}
      disabled={p.disabled || busy}
      aria-busy={busy || undefined}
      {...p}
    >
      {busy && <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

// ── Actions: run, show the real result, refresh server data ────────────────
export function useAction() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<ApiError | null>(null)
  const run = React.useCallback(async <T,>(fn: () => Promise<T>, opts: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      const out = await fn()
      if (opts.success) toast.success(opts.success)
      if (opts.refresh !== false) router.refresh()
      return out
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError('הפעולה נכשלה. נסו שוב.', 'UNKNOWN', 0)
      setError(err)
      if (err.code === 'STALE_TARGET' || err.code === 'VERSION_CONFLICT') {
        toast.error(err.message, { action: { label: 'רענון', onClick: () => router.refresh() } })
      } else {
        toast.error(err.message)
      }
      return undefined
    } finally {
      setBusy(false)
    }
  }, [router])
  return { busy, error, run, setError }
}

/** Warn before leaving a page with unsaved edits. */
export function useUnsavedGuard(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
}

/** Modal dialog with focus handling. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button')
    first?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-wizard-text-secondary hover:bg-brand-pearl" aria-label="סגירה">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Tab links `${basePath}?tab=key`. Takes a string (not a function) so server components can render it. */
export function Tabs({ tabs, current, basePath }: { tabs: { key: string; label: string; badge?: number }[]; current: string; basePath: string }) {
  return (
    <nav aria-label="לשוניות" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-wizard-border">
        {tabs.map((t) => (
          <li key={t.key}>
            <a href={`${basePath}?tab=${t.key}`} aria-current={t.key === current ? 'page' : undefined}
              className={cn('inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium',
                t.key === current ? 'border-brand-primary text-foreground' : 'border-transparent text-wizard-text-secondary hover:text-foreground')}>
              {t.label}
              {!!t.badge && <span className="rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-900">{t.badge}</span>}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
