'use client'

/**
 * /blueprint/[id] — the strategic "פיצוח" gate.
 * After the wizard is approved, the user reviews and edits the deck blueprint
 * (the crack, the insight, the strategy, and the slide-by-slide plan) BEFORE
 * the slides are rendered. On approve → /api/generate-full { useBlueprint } and
 * on to the generation view. RTL Hebrew.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { DeckBlueprint, BlueprintSlide } from '@/lib/gemini/deck-blueprint'

export default function BlueprintPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params.id as string

  const [bp, setBp] = useState<DeckBlueprint | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [building, setBuilding] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load or generate the blueprint on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/generate-blueprint', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'הפקת הפיצוח נכשלה')
        if (!cancelled) { setBp(json.blueprint); setLoading(false) }
      } catch (e) {
        if (!cancelled) { setError(e instanceof Error ? e.message : 'שגיאה'); setLoading(false) }
      }
    })()
    return () => { cancelled = true }
  }, [documentId])

  // Debounced auto-save to _deckBlueprint.
  const persist = useCallback((next: DeckBlueprint) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _deckBlueprint: next }),
        })
      } finally { setSaving(false) }
    }, 1200)
  }, [documentId])

  const update = useCallback((mut: (d: DeckBlueprint) => DeckBlueprint) => {
    setBp(prev => {
      if (!prev) return prev
      const next = mut(structuredClone(prev))
      persist(next)
      return next
    })
  }, [persist])

  async function regenerate() {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/generate-blueprint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, regenerate: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'הפקה מחדש נכשלה')
      setBp(json.blueprint)
    } catch (e) { setError(e instanceof Error ? e.message : 'שגיאה') }
    finally { setLoading(false) }
  }

  async function approveAndBuild() {
    if (!bp) return
    setBuilding(true)
    try {
      const approved = { ...bp, approved: true }
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _deckBlueprint: approved }),
      })
      // Kick off generation with the approved blueprint, then go to the
      // generation/progress view (which polls the doc and lands on /edit).
      fetch('/api/generate-full', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, useBlueprint: true }),
      }).catch(() => undefined)
      router.push(`/generate/${documentId}`)
    } catch {
      setBuilding(false)
      toast.error('בנייה נכשלה — נסה שוב')
    }
  }

  if (loading) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: 44 }}>🧠</div>
          <h2 style={{ fontSize: 22, marginTop: 12 }}>מפצח את האסטרטגיה…</h2>
          <p style={{ color: '#8a8a90', marginTop: 8 }}>מגבש את התובנה, האסטרטגיה ותוכנית השקפים. כדקה.</p>
        </div>
      </Shell>
    )
  }

  if (error || !bp) {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <p style={{ margin: '12px 0 20px' }}>{error || 'לא נמצא פיצוח'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Button onClick={regenerate}>נסה שוב</Button>
            <Button variant="outline" onClick={() => {
              fetch('/api/generate-full', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId }) }).catch(() => undefined)
              router.push(`/generate/${documentId}`)
            }}>דלג ובנה ישירות</Button>
          </div>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>🧠 הפיצוח האסטרטגי</h1>
          <p style={{ color: '#8a8a90', marginTop: 4 }}>סקור, תקן, ואשר — המצגת תיבנה בדיוק לפי מה שתאשר כאן.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: saving ? '#f59e0b' : '#16a34a' }}>{saving ? 'שומר…' : 'נשמר ✓'}</span>
          <Button variant="outline" onClick={regenerate}>הפק מחדש</Button>
          <Button onClick={approveAndBuild} disabled={building}
            style={{ background: '#7c3aed', color: '#fff' }}>
            {building ? 'בונה…' : 'אשר ובנה מצגת ↗'}
          </Button>
        </div>
      </header>

      {/* The crack */}
      <Section title="הפיצוח" hint="המשפט שמסביר את כל המהלך">
        <Textarea value={bp.theCrack} rows={2}
          onChange={e => update(d => { d.theCrack = e.target.value; return d })} />
      </Section>

      {/* Key insight */}
      <Section title="התובנה המרכזית" hint="עמוד השדרה — כל שקף מפתח אותה">
        <Textarea value={bp.keyInsight} rows={2}
          onChange={e => update(d => { d.keyInsight = e.target.value; return d })} />
      </Section>

      {/* Strategy */}
      <Section title="האסטרטגיה" hint="כותרת + עמודי תווך">
        <Input value={bp.strategy.headline} placeholder="כותרת האסטרטגיה"
          onChange={e => update(d => { d.strategy.headline = e.target.value; return d })}
          style={{ marginBottom: 12, fontWeight: 700 }} />
        {bp.strategy.pillars.map((p, i) => (
          <div key={i} style={pillarRow}>
            <Input value={p.title} placeholder="עמוד תווך"
              onChange={e => update(d => { d.strategy.pillars[i].title = e.target.value; return d })}
              style={{ flex: '0 0 30%', fontWeight: 600 }} />
            <Input value={p.description} placeholder="מה עושים ולמה זה עובד"
              onChange={e => update(d => { d.strategy.pillars[i].description = e.target.value; return d })}
              style={{ flex: 1 }} />
            <button style={delBtn} onClick={() => update(d => { d.strategy.pillars.splice(i, 1); return d })}>✕</button>
          </div>
        ))}
        <Button variant="outline" style={{ marginTop: 8 }}
          onClick={() => update(d => { d.strategy.pillars.push({ title: '', description: '' }); return d })}>+ עמוד תווך</Button>
      </Section>

      {/* Audience focus */}
      <Section title="על מה מתמקדים" hint="הקהל והדגש המרכזי">
        <Textarea value={bp.audienceFocus} rows={2}
          onChange={e => update(d => { d.audienceFocus = e.target.value; return d })} />
      </Section>

      {/* Slide plan */}
      <Section title={`תוכנית השקפים (${bp.slidePlan.length})`} hint="מה כל שקף מציג ועל מה מתמקד — גרור/ערוך/הוסף/מחק">
        {bp.slidePlan.map((s, i) => (
          <SlideCard key={i} idx={i} total={bp.slidePlan.length} slide={s}
            onChange={(field, v) => update(d => { (d.slidePlan[i] as unknown as Record<string, string>)[field] = v; return d })}
            onMove={dir => update(d => {
              const j = i + dir
              if (j < 0 || j >= d.slidePlan.length) return d
              ;[d.slidePlan[i], d.slidePlan[j]] = [d.slidePlan[j], d.slidePlan[i]]
              return d
            })}
            onDelete={() => update(d => { d.slidePlan.splice(i, 1); return d })} />
        ))}
        <Button variant="outline" style={{ marginTop: 8 }}
          onClick={() => update(d => { d.slidePlan.push({ slideType: 'content', title: '', purpose: '', whatItShows: '', focus: '' }); return d })}>+ שקף</Button>
      </Section>

      <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 32, paddingTop: 20, borderTop: '1px solid #26262b' }}>
        <Button onClick={approveAndBuild} disabled={building}
          style={{ background: '#7c3aed', color: '#fff', fontSize: 16, padding: '12px 28px' }}>
          {building ? 'בונה מצגת…' : 'אשר ובנה מצגת ↗'}
        </Button>
      </div>
    </Shell>
  )
}

// ─── Presentational bits ────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={{ minHeight: '100vh', background: '#0f0f10', color: '#ececee', fontFamily: 'Heebo, sans-serif' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 24px 80px' }}>{children}</div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section style={{ background: '#161618', border: '1px solid #26262b', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
        {hint && <p style={{ fontSize: 12, color: '#8a8a90', marginTop: 2 }}>{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function SlideCard({ idx, total, slide, onChange, onMove, onDelete }: {
  idx: number; total: number; slide: BlueprintSlide
  onChange: (field: keyof BlueprintSlide, v: string) => void
  onMove: (dir: -1 | 1) => void; onDelete: () => void
}) {
  return (
    <div style={{ background: '#1c1c20', border: '1px solid #2c2c33', borderRadius: 10, padding: 14, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: '#8a8a90', minWidth: 42 }}>שקף {idx + 1}</span>
        <Input value={slide.slideType} placeholder="סוג (cover / insight / pillar-1 …)"
          onChange={e => onChange('slideType', e.target.value)}
          style={{ flex: '0 0 180px', fontSize: 12, fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }} />
        <Input value={slide.title} placeholder="כותרת השקף"
          onChange={e => onChange('title', e.target.value)} style={{ flex: 1, fontWeight: 600 }} />
        <button style={moveBtn} disabled={idx === 0} onClick={() => onMove(-1)}>↑</button>
        <button style={moveBtn} disabled={idx === total - 1} onClick={() => onMove(1)}>↓</button>
        <button style={delBtn} onClick={onDelete}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="מציג" value={slide.whatItShows} onChange={v => onChange('whatItShows', v)} />
        <Field label="מתמקד" value={slide.focus} onChange={v => onChange('focus', v)} />
      </div>
      <Field label="תפקיד בסיפור" value={slide.purpose} onChange={v => onChange('purpose', v)} full />
    </div>
  )
}

function Field({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <div style={{ marginTop: full ? 10 : 0 }}>
      <label style={{ fontSize: 11, color: '#8a8a90', display: 'block', marginBottom: 3 }}>{label}</label>
      <Textarea value={value} rows={2} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
    </div>
  )
}

const pillarRow: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }
const delBtn: React.CSSProperties = { background: '#3a1d24', color: '#f87171', border: 'none', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', flex: '0 0 auto' }
const moveBtn: React.CSSProperties = { background: '#26262b', color: '#ccc', border: 'none', borderRadius: 6, width: 30, height: 30, cursor: 'pointer', flex: '0 0 auto' }
