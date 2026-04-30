'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Drop-in panel that lets the user choose between regular research (already
 * running by default in the pipeline) and Gemini Deep Research — a thorough
 * Tier-2 mode that takes 5-15 minutes and costs $1-3 per task. Useful for
 * brands where the regular research came back sparse, or for due-diligence-
 * grade brand audits before high-stakes pitches.
 *
 * The panel is fully self-contained: it kicks off the interaction, polls
 * /api/deep-research/status every 20s, and surfaces the result inline.
 */

export type DeepResearchMode = 'brand' | 'influencers' | 'competitors'

interface Props {
  documentId: string
  mode: DeepResearchMode
  /** Hebrew label displayed on the panel title. */
  label?: string
  /** Called once with the parsed/text result when the research completes. */
  onComplete?: (result: { text: string; parsed?: unknown }) => void
}

type Status = 'idle' | 'starting' | 'in_progress' | 'completed' | 'failed'

const MODE_LABELS: Record<DeepResearchMode, { title: string; subtitle: string }> = {
  brand: {
    title: 'מחקר מותג עמוק',
    subtitle: 'דוח מקיף עם ציטוטים על המותג, מתחרים ושוק — 5-10 דקות',
  },
  influencers: {
    title: 'איתור משפיענים עמוק',
    subtitle: 'חיפוש Google מאומת של 10 משפיעניות ישראליות בנישה — 5-8 דקות',
  },
  competitors: {
    title: 'ניתוח קמפיינים של מתחרים',
    subtitle: 'מה המתחרים עשו ב-24 חודשים אחרונים, ולמה — 5-12 דקות',
  },
}

export function DeepResearchPanel({ documentId, mode, label, onComplete }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [agent, setAgent] = useState<'fast' | 'max'>('fast')
  const [error, setError] = useState<string | null>(null)
  const [interactionId, setInteractionId] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [result, setResult] = useState<{ text: string; parsed?: unknown } | null>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  // On mount: check if a previous run exists for this mode + document.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/deep-research/status?documentId=${documentId}&mode=${mode}`)
        if (!res.ok) return
        const json = await res.json() as { status?: string; text?: string; parsed?: unknown; startedAt?: string }
        if (!alive) return
        if (json.status === 'completed' && json.text) {
          setStatus('completed')
          setResult({ text: json.text, parsed: json.parsed })
        } else if (json.status === 'in_progress') {
          setStatus('in_progress')
          if (json.startedAt) setStartedAt(new Date(json.startedAt).getTime())
        }
      } catch { /* no prior run */ }
    })()
    return () => { alive = false }
  }, [documentId, mode])

  // Polling loop while in_progress.
  useEffect(() => {
    if (status !== 'in_progress') return
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/deep-research/status?documentId=${documentId}&mode=${mode}`)
        if (!res.ok) {
          pollTimerRef.current = setTimeout(tick, 20_000)
          return
        }
        const json = await res.json() as { status?: string; text?: string; parsed?: unknown; error?: string }
        if (cancelled) return
        if (json.status === 'completed') {
          setStatus('completed')
          const r = { text: json.text || '', parsed: json.parsed }
          setResult(r)
          onCompleteRef.current?.(r)
          return
        }
        if (json.status === 'failed') {
          setStatus('failed')
          setError(json.error || 'הסוכן נכשל')
          return
        }
        pollTimerRef.current = setTimeout(tick, 20_000)
      } catch {
        pollTimerRef.current = setTimeout(tick, 30_000)
      }
    }
    pollTimerRef.current = setTimeout(tick, 20_000)
    return () => {
      cancelled = true
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [status, documentId, mode])

  const start = useCallback(async () => {
    setError(null)
    setStatus('starting')
    try {
      const res = await fetch('/api/deep-research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, mode, agent }),
      })
      const json = await res.json() as { interactionId?: string; status?: string; error?: string }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setInteractionId(json.interactionId || null)
      setStartedAt(Date.now())
      setStatus('in_progress')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('idle')
    }
  }, [documentId, mode, agent])

  const labels = MODE_LABELS[mode]
  const elapsedMin = startedAt ? Math.floor((Date.now() - startedAt) / 60_000) : 0

  return (
    <div dir="rtl" className="rounded-xl border border-brand-primary/15 bg-brand-ivory text-brand-primary p-5 font-heebo">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">{label || labels.title}</h3>
            <span className="text-[10px] tracking-[0.3em] uppercase font-rubik text-brand-primary/55">
              Gemini Deep Research
            </span>
          </div>
          <p className="text-[13px] text-brand-primary/65 mt-1">{labels.subtitle}</p>
        </div>
        {status === 'idle' && (
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value as 'fast' | 'max')}
            className="text-xs border border-brand-primary/15 rounded-md px-2 py-1 bg-brand-pearl/40"
          >
            <option value="fast">מהיר (~5 ד׳, $1-3)</option>
            <option value="max">עמוק (~15 ד׳, $3-7)</option>
          </select>
        )}
      </div>

      {status === 'idle' && (
        <button
          type="button"
          onClick={start}
          className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-brand-primary text-brand-ivory py-2.5 text-sm font-semibold hover:bg-brand-accent transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <circle cx="11" cy="11" r="7" />
            <path d="M16 16l4 4" />
          </svg>
          הפעל מחקר עמוק
        </button>
      )}

      {status === 'starting' && (
        <p className="text-sm text-brand-primary/65">פותח את הסוכן…</p>
      )}

      {status === 'in_progress' && (
        <div className="rounded-lg bg-brand-pearl/50 border border-brand-primary/10 p-3 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
            <span className="font-medium">הסוכן רץ ברקע…</span>
          </div>
          <p className="text-xs text-brand-primary/55 leading-relaxed">
            עברו {elapsedMin} ד׳ • זמן ממוצע 5-15 ד׳ • אפשר לסגור את הדף, נשמור את התוצאה.
            {interactionId && <> Interaction <span className="font-mono">{interactionId.slice(0, 12)}…</span></>}
          </p>
        </div>
      )}

      {status === 'completed' && result && (
        <div className="rounded-lg bg-brand-pearl/50 border border-brand-primary/10 p-3">
          <p className="text-xs text-emerald-700 font-bold mb-2">✓ הסתיים</p>
          <details>
            <summary className="cursor-pointer text-sm font-medium">הצג את התוצאה המלאה</summary>
            <pre className="mt-2 max-h-96 overflow-auto text-[11px] whitespace-pre-wrap text-brand-primary/75 leading-relaxed">
              {result.text}
            </pre>
          </details>
        </div>
      )}

      {status === 'failed' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm">
          <p className="text-red-700 font-medium mb-1">נכשל</p>
          <p className="text-xs text-red-600">{error || 'שגיאה לא ידועה'}</p>
          <button
            type="button"
            onClick={start}
            className="mt-2 text-xs underline text-red-700 hover:text-red-900"
          >
            נסה שוב
          </button>
        </div>
      )}

      {error && status === 'idle' && (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}
