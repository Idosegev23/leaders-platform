'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ResearchStepData } from '@/types/wizard'
import GoogleDriveSaveButton from '@/components/google-drive-save-button'

interface StepResearchProps {
  data: Partial<ResearchStepData>
  extractedData: Partial<ResearchStepData>
  onChange: (data: Partial<ResearchStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  documentId?: string
  brandName?: string
}

// ─── Progress stage messages ────────────────────────────
const BRAND_STAGES = [
  'מחפש מידע על המותג...',
  'סורק אתרים ומקורות...',
  'מנתח מתחרים בשוק...',
  'בוחן קהל יעד...',
  'מזהה נוכחות דיגיטלית...',
  'מסכם תובנות...',
]

const INFLUENCER_STAGES = [
  'מנתח נישת המותג...',
  'מאתר משפיענים רלוונטיים...',
  'בודק פרופילים...',
  'בונה אסטרטגיית משפיענים...',
  'מכין המלצות...',
]

export default function StepResearch({
  data,
  onChange,
  brandName: brandNameProp,
  briefContext,
}: StepResearchProps) {
  const phase = data.researchPhase || 'idle'
  const enabled = data.researchEnabled ?? false

  // Extract brand name from props or briefContext
  const brandName = brandNameProp || briefContext?.split(':')?.[0]?.trim() || ''

  // Progress animation
  const [brandStageIdx, setBrandStageIdx] = useState(0)
  const [influencerStageIdx, setInfluencerStageIdx] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [brandDone, setBrandDone] = useState(false)
  const [influencerDone, setInfluencerDone] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    brand: true,
    competitors: true,
    audience: true,
    social: false,
    influencers: true,
    strategy: true,
    sources: false,
  })

  // Drive save state
  const [driveUrl, setDriveUrl] = useState<string | null>(null)

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  // ─── Progress animation timer ─────────────────────────
  useEffect(() => {
    if (phase !== 'running') return
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
      if (!brandDone) setBrandStageIdx(prev => (prev + 1) % BRAND_STAGES.length)
      if (!influencerDone) setInfluencerStageIdx(prev => (prev + 1) % INFLUENCER_STAGES.length)
    }, 8000)
    const secondTimer = setInterval(() => setElapsed(prev => prev + 1), 1000)
    return () => { clearInterval(interval); clearInterval(secondTimer) }
  }, [phase, brandDone, influencerDone])

  // ─── Run research ─────────────────────────────────────
  const runResearch = useCallback(async () => {
    const controller = new AbortController()
    abortRef.current = controller
    setBrandDone(false)
    setInfluencerDone(false)
    setElapsed(0)
    setBrandStageIdx(0)
    setInfluencerStageIdx(0)

    onChange({
      ...data,
      researchEnabled: true,
      researchPhase: 'running',
      errorMessage: undefined,
    })

    try {
      const [brandResult, influencerResult] = await Promise.allSettled([
        fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandName }),
          signal: controller.signal,
        }).then(async res => {
          setBrandDone(true)
          if (!res.ok) throw new Error('Brand research failed')
          return res.json()
        }),
        fetch('/api/influencers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'research',
            brandResearch: { brandName, industry: '' },
            budget: 0,
            goals: [],
          }),
          signal: controller.signal,
        }).then(async res => {
          setInfluencerDone(true)
          if (!res.ok) throw new Error('Influencer research failed')
          return res.json()
        }),
      ])

      const br = brandResult.status === 'fulfilled' ? brandResult.value.research : null
      const colors = brandResult.status === 'fulfilled' ? brandResult.value.colors : null
      const is = influencerResult.status === 'fulfilled'
        ? (influencerResult.value.strategy || influencerResult.value)
        : null

      if (!br && !is) {
        onChange({
          ...data,
          researchEnabled: true,
          researchPhase: 'error',
          errorMessage: 'שני המחקרים נכשלו. נסה שוב.',
        })
        return
      }

      onChange({
        ...data,
        researchEnabled: true,
        researchPhase: 'complete',
        brandResearch: br || null,
        influencerStrategy: is || null,
        brandColors: colors || null,
        errorMessage: undefined,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      onChange({
        ...data,
        researchEnabled: true,
        researchPhase: 'error',
        errorMessage: 'שגיאה במחקר. נסה שוב.',
      })
    }
  }, [brandName, data, onChange])

  const cancelResearch = useCallback(() => {
    abortRef.current?.abort()
    onChange({ ...data, researchPhase: 'idle', researchEnabled: false })
  }, [data, onChange])

  // ─── Get research PDF for Drive save ─────────────────
  const getResearchPdf = useCallback(async () => {
    const res = await fetch('/api/research-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandName,
        brandResearch: data.brandResearch,
        influencerStrategy: data.influencerStrategy,
        brandColors: data.brandColors,
        skipDriveUpload: true,
      }),
    })
    if (!res.ok) throw new Error('PDF generation failed')
    const result = await res.json()
    const pdfUrl = result.supabaseUrl || result.viewUrl
    const pdfRes = await fetch(pdfUrl)
    const blob = await pdfRes.blob()
    return {
      blob,
      fileName: `מחקר_${brandName}_${new Date().toISOString().split('T')[0]}.pdf`,
      mimeType: 'application/pdf',
    }
  }, [brandName, data])

  // ─── Edit helpers ─────────────────────────────────────
  const updateBrandField = useCallback((field: string, value: unknown) => {
    if (!data.brandResearch) return
    onChange({ ...data, brandResearch: { ...data.brandResearch, [field]: value } })
  }, [data, onChange])

  const updateInfluencerField = useCallback((field: string, value: unknown) => {
    if (!data.influencerStrategy) return
    onChange({ ...data, influencerStrategy: { ...data.influencerStrategy, [field]: value } })
  }, [data, onChange])

  // ═══════════════════════════════════════════════════════
  // PHASE: IDLE
  // ═══════════════════════════════════════════════════════
  if (phase === 'idle') {
    return (
      <div className="space-y-6">
        <div className="text-center py-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-blue-400">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">מחקר מותג ומשפיענים</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            סריקה מעמיקה של המותג, מתחרים, קהל יעד ומשפיענים רלוונטיים.
            המחקר יעשיר את כל שלבי ההצעה בנתונים אמיתיים.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: '🏢', title: 'סקירת מותג', desc: 'רקע, תעשייה, ערכים ואישיות' },
            { icon: '⚔️', title: 'מתחרים', desc: 'ניתוח שוק ומיצוב' },
            { icon: '👥', title: 'קהל יעד', desc: 'דמוגרפיה, התנהגות ותובנות' },
            { icon: '📱', title: 'משפיענים', desc: 'אסטרטגיה והמלצות מותאמות' },
          ].map(item => (
            <div key={item.title} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <div className="text-2xl mb-2">{item.icon}</div>
              <div className="font-semibold text-sm text-gray-800">{item.title}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.desc}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 pt-2">
          <Button
            onClick={runResearch}
            disabled={!brandName}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 text-base font-bold rounded-xl shadow-lg"
          >
            הפעל מחקר עבור {brandName || '...'}
          </Button>
          {!brandName && (
            <p className="text-xs text-amber-600">יש לחזור לשלב הבריף ולהזין שם מותג</p>
          )}
          <button
            onClick={() => onChange({ ...data, researchEnabled: false, researchPhase: 'idle' })}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            דלג על מחקר
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // PHASE: RUNNING
  // ═══════════════════════════════════════════════════════
  if (phase === 'running') {
    return (
      <div className="space-y-6 py-4">
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-800 mb-1">מבצע מחקר עבור {brandName}</h3>
          <p className="text-sm text-gray-500">זה יכול לקחת 1-2 דקות</p>
          <div className="mt-3 text-2xl font-mono font-bold text-blue-600 tabular-nums" dir="ltr">
            {Math.floor(elapsed / 60).toString().padStart(2, '0')}:{(elapsed % 60).toString().padStart(2, '0')}
          </div>
        </div>

        {/* Brand research track */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-center gap-3 mb-3">
            {brandDone ? (
              <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div>
              <div className="font-semibold text-sm text-blue-800">מחקר מותג ושוק</div>
              <div className="text-xs text-blue-600 animate-pulse">
                {brandDone ? 'הושלם!' : BRAND_STAGES[brandStageIdx]}
              </div>
            </div>
          </div>
          <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-blue-500 to-blue-400 rounded-full transition-all duration-1000"
              style={{ width: brandDone ? '100%' : `${Math.min(15 + brandStageIdx * 14, 85)}%` }}
            />
          </div>
        </div>

        {/* Influencer research track */}
        <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
          <div className="flex items-center gap-3 mb-3">
            {influencerDone ? (
              <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-purple-500 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div>
              <div className="font-semibold text-sm text-purple-800">מחקר משפיענים</div>
              <div className="text-xs text-purple-600 animate-pulse">
                {influencerDone ? 'הושלם!' : INFLUENCER_STAGES[influencerStageIdx]}
              </div>
            </div>
          </div>
          <div className="h-2 bg-purple-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-purple-500 to-purple-400 rounded-full transition-all duration-1000"
              style={{ width: influencerDone ? '100%' : `${Math.min(20 + influencerStageIdx * 16, 85)}%` }}
            />
          </div>
        </div>

        <div className="text-center">
          <button onClick={cancelResearch} className="text-sm text-gray-400 hover:text-red-500 transition-colors">
            בטל מחקר
          </button>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // PHASE: ERROR
  // ═══════════════════════════════════════════════════════
  if (phase === 'error') {
    return (
      <div className="space-y-4 py-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <div className="text-3xl mb-3">!</div>
          <h3 className="font-bold text-red-800 mb-1">שגיאה במחקר</h3>
          <p className="text-sm text-red-600 mb-4">{data.errorMessage || 'משהו השתבש'}</p>
          <div className="flex gap-3 justify-center">
            <Button onClick={runResearch} className="bg-red-600 hover:bg-red-700 text-white">
              נסה שוב
            </Button>
            <button
              onClick={() => onChange({ ...data, researchPhase: 'idle', researchEnabled: false })}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2"
            >
              דלג על מחקר
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════
  // PHASE: COMPLETE (Results + Edit)
  // ═══════════════════════════════════════════════════════
  const br = data.brandResearch
  const is = data.influencerStrategy

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          </div>
          <span className="text-sm font-semibold text-green-800">מחקר הושלם בהצלחה</span>
        </div>
        <div className="flex items-center gap-2">
          {driveUrl ? (
            <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline font-medium">
              פתח ב-Drive
            </a>
          ) : (
            <GoogleDriveSaveButton
              getFileData={getResearchPdf}
              onSaved={(result) => setDriveUrl(result.webViewLink)}
              onError={() => alert('שגיאה בשמירה ל-Drive')}
              label="שמור מחקר ב-Drive"
              className="text-xs h-8 border-green-300 text-green-700 hover:bg-green-100"
            />
          )}
          <button
            onClick={runResearch}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="הרץ מחדש"
          >
            🔄
          </button>
        </div>
      </div>

      {/* ── Section: Brand Overview ────────────────────── */}
      {br && (
        <CollapsibleSection
          title="סקירת מותג"
          icon="🏢"
          isOpen={openSections.brand}
          onToggle={() => toggleSection('brand')}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">תעשייה</label>
              <Input
                value={br.industry || ''}
                onChange={e => updateBrandField('industry', e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">תיאור החברה</label>
              <Textarea
                value={br.companyDescription || ''}
                onChange={e => updateBrandField('companyDescription', e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
            {br.brandPersonality?.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">אישיות המותג</label>
                <div className="flex flex-wrap gap-1.5">
                  {br.brandPersonality.map((p, i) => (
                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {br.brandValues?.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ערכי המותג</label>
                <div className="flex flex-wrap gap-1.5">
                  {br.brandValues.map((v, i) => (
                    <span key={i} className="text-xs bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Competitors ──────────────────────── */}
      {br?.competitors && br.competitors.length > 0 && (
        <CollapsibleSection
          title={`שוק ומתחרים (${br.competitors.length})`}
          icon="⚔️"
          isOpen={openSections.competitors}
          onToggle={() => toggleSection('competitors')}
        >
          <div className="space-y-2">
            {br.competitors.map((comp, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <Input
                    value={comp.name}
                    onChange={e => {
                      const updated = [...br.competitors]
                      updated[i] = { ...comp, name: e.target.value }
                      updateBrandField('competitors', updated)
                    }}
                    className="text-sm font-semibold border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                    placeholder="שם מתחרה"
                  />
                  <button
                    onClick={() => {
                      const updated = br.competitors.filter((_, j) => j !== i)
                      updateBrandField('competitors', updated)
                    }}
                    className="text-gray-300 hover:text-red-500 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <Input
                  value={comp.description}
                  onChange={e => {
                    const updated = [...br.competitors]
                    updated[i] = { ...comp, description: e.target.value }
                    updateBrandField('competitors', updated)
                  }}
                  className="text-xs text-gray-600 border-0 bg-transparent p-0 h-auto focus-visible:ring-0 mt-1"
                  placeholder="תיאור"
                />
              </div>
            ))}
            <button
              onClick={() => updateBrandField('competitors', [...br.competitors, { name: '', description: '', differentiator: '' }])}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + הוסף מתחרה
            </button>
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Target Audience ──────────────────── */}
      {br?.targetDemographics?.primaryAudience && (
        <CollapsibleSection
          title="קהל יעד"
          icon="👥"
          isOpen={openSections.audience}
          onToggle={() => toggleSection('audience')}
        >
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">מגדר</label>
                <Input value={br.targetDemographics.primaryAudience.gender || ''} readOnly className="text-sm bg-gray-50" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">טווח גילאים</label>
                <Input value={br.targetDemographics.primaryAudience.ageRange || ''} readOnly className="text-sm bg-gray-50" />
              </div>
            </div>
            {br.targetDemographics.primaryAudience.interests?.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">תחומי עניין</label>
                <div className="flex flex-wrap gap-1.5">
                  {br.targetDemographics.primaryAudience.interests.map((interest, i) => (
                    <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full border border-purple-100">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {br.targetDemographics.primaryAudience.painPoints?.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">נקודות כאב</label>
                <div className="flex flex-wrap gap-1.5">
                  {br.targetDemographics.primaryAudience.painPoints.map((p, i) => (
                    <span key={i} className="text-xs bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Social Presence ──────────────────── */}
      {br?.socialPresence && Object.keys(br.socialPresence).length > 0 && (
        <CollapsibleSection
          title="נוכחות דיגיטלית"
          icon="📱"
          isOpen={openSections.social}
          onToggle={() => toggleSection('social')}
        >
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(br.socialPresence).map(([platform, info]) => (
              <div key={platform} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="font-semibold text-xs text-gray-800 capitalize mb-1">{platform}</div>
                {info.handle && <div className="text-xs text-gray-500" dir="ltr">{info.handle}</div>}
                {info.followers && <div className="text-xs text-blue-600 font-medium">{info.followers} עוקבים</div>}
                {info.engagement && <div className="text-xs text-green-600">{info.engagement} מעורבות</div>}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Influencer Recommendations ──────── */}
      {is && (
        <CollapsibleSection
          title={`משפיענים מומלצים (${is.recommendations?.length || 0})`}
          icon="⭐"
          isOpen={openSections.influencers}
          onToggle={() => toggleSection('influencers')}
        >
          <div className="space-y-3">
            {is.strategySummary && (
              <Textarea
                value={is.strategySummary}
                onChange={e => updateInfluencerField('strategySummary', e.target.value)}
                rows={2}
                className="text-sm"
                placeholder="סיכום אסטרטגיית משפיענים"
              />
            )}
            {is.recommendations?.map((rec, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-white text-xs font-bold">
                      {rec.name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{rec.name}</div>
                      <div className="text-xs text-gray-500" dir="ltr">{rec.handle}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const updated = is.recommendations.filter((_, j) => j !== i)
                      updateInfluencerField('recommendations', updated)
                    }}
                    className="text-gray-300 hover:text-red-500 text-xs"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  {rec.followers && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{rec.followers} עוקבים</span>}
                  {rec.engagement && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded">{rec.engagement} מעורבות</span>}
                  {rec.category && <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{rec.category}</span>}
                </div>
                {rec.whyRelevant && (
                  <p className="text-xs text-gray-500 mt-2">{rec.whyRelevant}</p>
                )}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Strategic Insights ───────────────── */}
      {(br?.suggestedApproach || is?.contentThemes?.length || is?.expectedKPIs?.length || br?.industryTrends?.length) && (
        <CollapsibleSection
          title="תובנות אסטרטגיות"
          icon="💡"
          isOpen={openSections.strategy}
          onToggle={() => toggleSection('strategy')}
        >
          <div className="space-y-3">
            {br?.suggestedApproach && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">גישה מומלצת</label>
                <Textarea
                  value={br.suggestedApproach}
                  onChange={e => updateBrandField('suggestedApproach', e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            )}
            {(is?.contentThemes?.length ?? 0) > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">ערוצי תוכן מומלצים</label>
                <div className="space-y-1">
                  {is!.contentThemes.map((t, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                      <span className="text-sm font-medium text-gray-800">{t.theme}</span>
                      {t.description && <span className="text-xs text-gray-500 mr-2">— {t.description}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(br?.industryTrends?.length ?? 0) > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">טרנדים בתעשייה</label>
                <div className="flex flex-wrap gap-1.5">
                  {br!.industryTrends!.map((t, i) => (
                    <span key={i} className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-100">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(is?.expectedKPIs?.length ?? 0) > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">יעדי KPI צפויים</label>
                <div className="grid grid-cols-2 gap-2">
                  {is!.expectedKPIs.map((kpi, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg p-2.5 border border-gray-100 text-center">
                      <div className="text-xs text-gray-500">{kpi.metric}</div>
                      <div className="text-sm font-bold text-gray-800" dir="ltr">{kpi.target}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* ── Section: Sources ──────────────────────────── */}
      {(br?.sources?.length ?? 0) > 0 && (
        <CollapsibleSection
          title={`מקורות (${br!.sources.length})`}
          icon="🔗"
          isOpen={openSections.sources}
          onToggle={() => toggleSection('sources')}
        >
          <div className="space-y-1">
            {br!.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-xs text-blue-600 hover:text-blue-800 hover:underline truncate"
              >
                {s.title || s.url}
              </a>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  )
}

// ─── Collapsible Section Component ──────────────────────
function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  icon: string
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer hover:bg-gray-50/50 transition-colors py-3 px-4"
        onClick={onToggle}
      >
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <span>{title}</span>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </CardTitle>
      </CardHeader>
      {isOpen && (
        <CardContent className="px-4 pb-4 pt-0">
          {children}
        </CardContent>
      )}
    </Card>
  )
}
