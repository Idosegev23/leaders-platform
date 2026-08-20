'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { SmartBriefRow } from '@/lib/smart-brief/service'
import { applyTemplateDefaults } from '@/lib/smart-brief/templates'
import type { BriefFields, FieldValue, SmartBriefTemplate, TemplateField } from '@/lib/smart-brief/templates'

type SaveState = 'saved' | 'saving' | 'dirty'

export default function BriefEditor({
  brief,
  template,
}: {
  brief: SmartBriefRow
  template: SmartBriefTemplate
}) {
  const [clientName, setClientName] = useState(brief.client_name ?? '')
  const [description, setDescription] = useState(
    typeof brief.ai_meta?.description === 'string' ? (brief.ai_meta.description as string) : '',
  )
  const [materials, setMaterials] = useState('')
  // תוכן מוכן מהטמפלט המקורי ממולא מראש בשדות ריקים
  const [fields, setFields] = useState<BriefFields>(() =>
    applyTemplateDefaults(template, brief.fields ?? {}),
  )
  const [generating, setGenerating] = useState(false)
  const [improving, setImproving] = useState<string | null>(null)
  const [checkingGaps, setCheckingGaps] = useState(false)
  const [gaps, setGaps] = useState<Array<{ key: string; note: string }> | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [sending, setSending] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(
    brief.status === 'sent' ? `/forms/brief/${brief.share_token}` : null,
  )
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasDraft = Object.values(fields).some((v) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v?.trim?.()),
  )
  const [contextOpen, setContextOpen] = useState(!hasDraft)

  // ── autosave (debounced) ────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persist = useCallback(
    async (nextFields: BriefFields, nextClientName: string, nextDescription: string) => {
      setSaveState('saving')
      try {
        await fetch(`/api/smart-brief/${brief.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: nextFields,
            clientName: nextClientName,
            title: nextClientName ? `${template.name} — ${nextClientName}` : template.name,
            aiMeta: { ...brief.ai_meta, description: nextDescription },
          }),
        })
        setSaveState('saved')
      } catch {
        setSaveState('dirty')
      }
    },
    [brief.id, brief.ai_meta, template.name],
  )

  const scheduleSave = useCallback(
    (nextFields: BriefFields, nextClientName: string, nextDescription: string) => {
      setSaveState('dirty')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => persist(nextFields, nextClientName, nextDescription), 1500)
    },
    [persist],
  )

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const setField = (key: string, value: FieldValue) => {
    const next = { ...fields, [key]: value }
    setFields(next)
    scheduleSave(next, clientName, description)
  }

  // ── AI actions ──────────────────────────────────────────────────
  const generateDraft = async () => {
    setError(null)
    setGenerating(true)
    try {
      const res = await fetch('/api/smart-brief/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: template.slug, clientName, description, materials }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const next = applyTemplateDefaults(template, { ...fields, ...json.fields })
      setFields(next)
      setContextOpen(false)
      setGaps(null)
      persist(next, clientName, description)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת הטיוטה נכשלה')
    }
    setGenerating(false)
  }

  const improveField = async (key: string) => {
    setImproving(key)
    setError(null)
    try {
      const res = await fetch('/api/smart-brief/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: template.slug, fields, action: 'improve', fieldKey: key }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setField(key, json.value)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שיפור הניסוח נכשל')
    }
    setImproving(null)
  }

  const checkGaps = async () => {
    setCheckingGaps(true)
    setError(null)
    try {
      const res = await fetch('/api/smart-brief/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug: template.slug, fields, action: 'gaps' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setGaps(json.gaps)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'בדיקת החוסרים נכשלה')
    }
    setCheckingGaps(false)
  }

  const send = async () => {
    setSending(true)
    setError(null)
    try {
      await persist(fields, clientName, description)
      const res = await fetch(`/api/smart-brief/${brief.id}/send`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setShareUrl(json.url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השליחה נכשלה')
    }
    setSending(false)
  }

  const copyShareUrl = async () => {
    if (!shareUrl) return
    const abs = shareUrl.startsWith('http') ? shareUrl : `${window.location.origin}${shareUrl}`
    await navigator.clipboard.writeText(abs)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const gapFor = (key: string) => gaps?.find((g) => g.key === key)?.note

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 md:px-8 py-10 md:py-14 text-brand-primary pb-32">
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center justify-between text-[12px] mb-6">
          <Link href="/smart-brief" className="text-brand-primary/55 hover:text-brand-primary transition-colors">
            → כל הבריפים
          </Link>
          <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
            {saveState === 'saving' ? 'שומר…' : saveState === 'dirty' ? 'שינויים לא שמורים' : 'נשמר'}
          </span>
        </div>
        <h1 className="text-[26px] md:text-[32px] leading-tight font-bold tracking-tight">{template.name}</h1>
        <p className="mt-1 text-[11px] text-brand-primary/55 font-rubik tracking-[0.04em] uppercase font-medium">
          {template.english} · נשלח {template.audienceLabel}
        </p>
      </header>

      {/* Context / AI draft */}
      <section className="mb-10 ring-1 ring-brand-primary/10 rounded-sm bg-brand-ivory">
        <button
          type="button"
          onClick={() => setContextOpen(!contextOpen)}
          className="w-full flex items-center justify-between p-5 text-right"
        >
          <span className="text-[14px] font-semibold flex items-center gap-2">
            <span className="text-brand-accent">✦</span>
            טיוטה עם AI
          </span>
          <span className="text-brand-primary/40 text-[12px]">{contextOpen ? '−' : '+'}</span>
        </button>

        {contextOpen && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-brand-primary/70 mb-1.5">שם הלקוח</label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => { setClientName(e.target.value); scheduleSave(fields, e.target.value, description) }}
                placeholder="למשל: קוקה קולה"
                className="w-full px-3.5 py-2.5 text-[14px] bg-white ring-1 ring-brand-primary/15 rounded-sm outline-none focus:ring-brand-primary/40 placeholder:text-brand-primary/35"
              />
              <p className="mt-1 text-[11px] text-brand-primary/45">
                אם ללקוח יש פגישת התנעה או בריף שמולא במערכת — ה-AI ישתמש בהם אוטומטית
              </p>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-brand-primary/70 mb-1.5">תאר את הקמפיין במילים שלך</label>
              <textarea
                value={description}
                onChange={(e) => { setDescription(e.target.value); scheduleSave(fields, clientName, e.target.value) }}
                rows={4}
                placeholder="מה הקמפיין, מה רוצים להשיג, למי מכוונים, מה חשוב שיהיה בתוכן…"
                className="w-full px-3.5 py-2.5 text-[14px] bg-white ring-1 ring-brand-primary/15 rounded-sm outline-none focus:ring-brand-primary/40 placeholder:text-brand-primary/35 resize-y"
              />
            </div>
            <details>
              <summary className="text-[12px] text-brand-primary/55 cursor-pointer select-none">
                חומרים נוספים (הדבקה חופשית — בריף ישן, מייל מהלקוח…)
              </summary>
              <textarea
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                rows={5}
                className="mt-2 w-full px-3.5 py-2.5 text-[13px] bg-white ring-1 ring-brand-primary/15 rounded-sm outline-none focus:ring-brand-primary/40 resize-y"
              />
            </details>
            <button
              type="button"
              onClick={generateDraft}
              disabled={generating || (!description.trim() && !clientName.trim())}
              className="w-full py-3 text-[14px] font-semibold bg-brand-primary text-brand-ivory rounded-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-40"
            >
              {generating ? 'בונה טיוטה…' : hasDraft ? '✦ בנה טיוטה מחדש (ידרוס את הקיים)' : '✦ בנה טיוטה עם AI'}
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className="mb-6 px-4 py-3 text-[13px] text-red-700 bg-red-50 ring-1 ring-red-200 rounded-sm">{error}</p>
      )}

      {/* Fields */}
      <section>
        {template.fields.map((f) => (
          <div key={f.key}>
            {f.section && (
              <div className="flex items-center gap-4 mt-10 mb-4 first:mt-0">
                <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
                  {f.section}
                </span>
                <div className="h-px flex-1 bg-brand-primary/10" />
              </div>
            )}
            <FieldInput
              field={f}
              value={fields[f.key]}
              gap={gapFor(f.key)}
              improving={improving === f.key}
              onChange={(v) => setField(f.key, v)}
              onImprove={() => improveField(f.key)}
            />
          </div>
        ))}
      </section>

      {gaps !== null && gaps.length === 0 && (
        <p className="mt-6 px-4 py-3 text-[13px] text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 rounded-sm">
          ✓ הבריף נראה שלם — לא נמצאו חוסרים
        </p>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 bg-brand-ivory/95 backdrop-blur border-t border-brand-primary/10">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-3 flex items-center gap-2" dir="rtl">
          <button
            type="button"
            onClick={checkGaps}
            disabled={checkingGaps || !hasDraft}
            className="px-4 py-2.5 text-[13px] font-medium ring-1 ring-brand-primary/20 rounded-sm hover:ring-brand-primary/40 transition-all disabled:opacity-40"
          >
            {checkingGaps ? 'בודק…' : 'בדוק חוסרים'}
          </button>
          <a
            href={`/forms/brief/${brief.share_token}?preview=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2.5 text-[13px] font-medium ring-1 ring-brand-primary/20 rounded-sm hover:ring-brand-primary/40 transition-all"
          >
            תצוגה מקדימה
          </a>
          <div className="flex-1" />
          {shareUrl ? (
            <button
              type="button"
              onClick={copyShareUrl}
              className="px-5 py-2.5 text-[13px] font-semibold bg-brand-accent text-white rounded-sm hover:opacity-90 transition-opacity"
            >
              {copied ? '✓ הועתק' : 'העתק קישור לנמען'}
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={sending || !hasDraft}
              className="px-5 py-2.5 text-[13px] font-semibold bg-brand-primary text-brand-ivory rounded-sm hover:bg-brand-primary/90 transition-colors disabled:opacity-40"
            >
              {sending ? 'שולח…' : 'צור קישור לשליחה'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── generic field renderer ─────────────────────────────────────── */

function FieldInput({
  field,
  value,
  gap,
  improving,
  onChange,
  onImprove,
}: {
  field: TemplateField
  value: FieldValue | undefined
  gap?: string
  improving: boolean
  onChange: (v: FieldValue) => void
  onImprove: () => void
}) {
  const textValue = Array.isArray(value) ? value.join('\n') : (value ?? '')
  const canImprove = field.type === 'text' || field.type === 'textarea' || field.type === 'list'

  const inputClass =
    'w-full px-3.5 py-2.5 text-[14px] bg-brand-ivory ring-1 ring-brand-primary/15 rounded-sm outline-none focus:ring-brand-primary/40 placeholder:text-brand-primary/35'

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-medium text-brand-primary/80">
          {field.label}
          {field.required && <span className="text-brand-accent mx-1">*</span>}
        </label>
        {canImprove && (
          <button
            type="button"
            onClick={onImprove}
            disabled={improving || !textValue.trim()}
            title="שפר ניסוח עם AI"
            className="text-[11px] text-brand-primary/45 hover:text-brand-accent transition-colors disabled:opacity-30 font-rubik"
          >
            {improving ? 'משפר…' : '✦ שפר ניסוח'}
          </button>
        )}
      </div>

      {field.type === 'textarea' && (
        <textarea
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className={`${inputClass} resize-y`}
        />
      )}
      {field.type === 'list' && (
        <>
          <textarea
            value={textValue}
            onChange={(e) => onChange(e.target.value.split('\n'))}
            rows={Math.max(3, (Array.isArray(value) ? value.length : 0) + 1)}
            placeholder={field.placeholder ?? 'פריט אחד בכל שורה'}
            className={`${inputClass} resize-y`}
          />
          <p className="mt-1 text-[11px] text-brand-primary/40">שורה לכל פריט</p>
        </>
      )}
      {field.type === 'text' && (
        <input
          type="text"
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={inputClass}
        />
      )}
      {field.type === 'date' && (
        <input
          type="date"
          value={textValue}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )}
      {field.type === 'select' && (
        <select value={textValue} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">בחר…</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )}

      {gap && (
        <p className="mt-1.5 px-3 py-2 text-[12px] text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-sm">
          {gap}
        </p>
      )}
    </div>
  )
}
