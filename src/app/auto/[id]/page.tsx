'use client'

/**
 * /auto/[id] — live progress for the full-auto deck pipeline
 * (content → blueprint → slides → Canva). Read-only: the work happens
 * server-side (QStash-driven); this page only polls the document.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

type StageKey = 'content' | 'blueprint' | 'slides' | 'canva'
type StageState = 'pending' | 'running' | 'done'

type CanvaLinks = { designId?: string; editUrl?: string; viewUrl?: string; mode?: string }

const STAGES: Array<{ key: StageKey; label: string; hint: string }> = [
  { key: 'content', label: 'תוכן ומחקר', hint: 'הסוכן חוקר את המותג וכותב את כל חומרי הגלם' },
  { key: 'blueprint', label: 'פיצוח המצגת', hint: 'מבנה, נרטיב וחלוקת שקפים' },
  { key: 'slides', label: 'בניית השקפים', hint: 'עיצוב, תמונות מותג אמיתיות ובקרת איכות ויזואלית' },
  { key: 'canva', label: 'פתיחה ב-Canva', hint: 'המרה ל-PPTX נייטיב וייבוא לחשבון הקנבה' },
]

export default function AutoDeckPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const documentId = params.id

  const [stages, setStages] = useState<Record<StageKey, StageState>>({
    content: 'running', blueprint: 'pending', slides: 'pending', canva: 'pending',
  })
  const [canva, setCanva] = useState<CanvaLinks | null>(null)
  const [title, setTitle] = useState('')
  const [startedAt] = useState(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [pollError, setPollError] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`, { cache: 'no-store' })
      if (!res.ok) { setPollError((n) => n + 1); return }
      const json = await res.json()
      const doc = json.document ?? json
      const data = (doc?.data ?? {}) as Record<string, unknown>
      setTitle((doc?.title as string) || '')
      setPollError(0)

      const hasStep = Boolean(data._stepData && Object.keys(data._stepData as object).length)
      const hasBlueprint = Boolean(data._deckBlueprint)
      const hasSlides = Boolean(
        (data._htmlPresentation as { htmlSlides?: unknown[] } | undefined)?.htmlSlides?.length,
      )
      const canvaData = data._canva as CanvaLinks | undefined
      const hasCanva = Boolean(canvaData?.editUrl)

      setStages({
        content: hasStep || hasBlueprint || hasSlides ? 'done' : 'running',
        blueprint: hasBlueprint || hasSlides ? 'done' : hasStep ? 'running' : 'pending',
        slides: hasSlides ? 'done' : hasBlueprint ? 'running' : 'pending',
        canva: hasCanva ? 'done' : hasSlides ? 'running' : 'pending',
      })
      if (hasCanva && canvaData) setCanva(canvaData)
    } catch {
      setPollError((n) => n + 1)
    }
  }, [documentId])

  useEffect(() => {
    poll()
    const id = setInterval(poll, 6000)
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    timerRef.current = id
    return () => { clearInterval(id); clearInterval(tick) }
  }, [poll, startedAt])

  useEffect(() => {
    if (canva && timerRef.current) clearInterval(timerRef.current)
  }, [canva])

  const mins = Math.floor(elapsed / 60)
  const secs = String(elapsed % 60).padStart(2, '0')
  const done = Boolean(canva)

  return (
    <div dir="rtl" className="min-h-screen bg-brand-ivory text-brand-primary">
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-12 md:py-16">
        <Link
          href="/dashboard"
          className="inline-block mb-8 text-[12px] text-brand-primary/55 hover:text-brand-primary transition-colors"
        >
          → חזרה לדשבורד
        </Link>

        <header className="mb-10">
          <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-4 font-medium">
            Auto Pipeline
          </p>
          <h1 className="text-[28px] md:text-[36px] leading-tight font-bold tracking-tight">
            {done ? 'המצגת מוכנה ב-Canva ✦' : 'בונה את המצגת אוטומטית'}
          </h1>
          <p className="mt-2 text-[14px] text-brand-primary/65">
            {title || 'מצגת קריאייטיבית'}
            {!done && <span className="tabular-nums"> · {mins}:{secs}</span>}
          </p>
        </header>

        <ol className="space-y-1 mb-10">
          {STAGES.map((s, i) => {
            const state = stages[s.key]
            return (
              <li key={s.key} className="flex items-start gap-4 py-4 border-b border-brand-primary/8 last:border-0">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-rubik font-medium ring-1 ${
                    state === 'done'
                      ? 'bg-brand-accent text-white ring-brand-accent'
                      : state === 'running'
                        ? 'bg-brand-gold/15 text-brand-primary ring-brand-gold/50'
                        : 'bg-brand-primary/[0.04] text-brand-primary/40 ring-brand-primary/10'
                  }`}
                >
                  {state === 'done' ? '✓' : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[15px] font-semibold ${state === 'pending' ? 'text-brand-primary/40' : ''}`}>
                    {s.label}
                    {state === 'running' && <span className="mx-2 inline-block animate-pulse text-brand-gold">●</span>}
                  </p>
                  <p className="mt-0.5 text-[12px] text-brand-primary/55 leading-relaxed">{s.hint}</p>
                </div>
              </li>
            )
          })}
        </ol>

        {done && canva ? (
          <div className="space-y-3">
            <a
              href={canva.editUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3.5 text-center text-[15px] font-semibold bg-brand-primary text-brand-ivory rounded-sm hover:bg-brand-primary/90 transition-colors"
            >
              🎨 פתח את המצגת ב-Canva
            </a>
            <button
              type="button"
              onClick={() => router.push(`/edit/${documentId}`)}
              className="block w-full py-3 text-center text-[13px] font-medium ring-1 ring-brand-primary/20 rounded-sm hover:ring-brand-primary/40 transition-all"
            >
              פתח בעורך הפנימי
            </button>
          </div>
        ) : (
          <div className="text-[12px] text-brand-primary/50 leading-relaxed space-y-2">
            <p>אפשר לסגור את הדף — הבנייה רצה בשרת ותסתיים לבד. המצגת תופיע במסמכים והקישור לקנבה יישמר עליה.</p>
            {elapsed > 60 * 18 && (
              <p className="text-amber-700">
                זה לוקח יותר מהרגיל. אפשר לבדוק את המסמך ישירות{' '}
                <button className="underline" onClick={() => router.push(`/generate/${documentId}`)}>במסך היצירה</button>.
              </p>
            )}
            {pollError > 3 && <p className="text-red-600">בעיה זמנית בקריאת הסטטוס — ממשיך לנסות…</p>}
          </div>
        )}
      </div>
    </div>
  )
}
