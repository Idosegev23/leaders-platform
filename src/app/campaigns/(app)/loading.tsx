export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <span className="sr-only">טוען…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-brand-pearl" />
      <div className="h-24 animate-pulse rounded-2xl bg-brand-pearl" />
      <div className="h-64 animate-pulse rounded-2xl bg-brand-pearl" />
    </div>
  )
}
