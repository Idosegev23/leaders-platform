'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { BriefStepData } from '@/types/wizard'
import BriefQuotePanel from '../brief-quote-panel'
import DualFieldSection from '../dual-field-section'
import { extractBriefExcerpt } from '../brief-excerpt-utils'
import ResearchContext from '../research-context'

interface StepBriefProps {
  data: Partial<BriefStepData>
  extractedData: Partial<BriefStepData>
  onChange: (data: Partial<BriefStepData>) => void
  errors: Record<string, string> | null
  rawBriefText?: string
  rawKickoffText?: string
  brandResearch?: Record<string, unknown> | null
}

function DocumentIcon() {
  return (
    <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

export default function StepBrief({ data, extractedData, onChange, errors, rawBriefText, rawKickoffText, brandResearch }: StepBriefProps) {
  const brandName = data.brandName ?? ''
  const brandBrief = data.brandBrief ?? ''
  const brandPainPoints = data.brandPainPoints ?? []
  const brandObjective = data.brandObjective ?? ''
  const successMetrics = data.successMetrics ?? []
  const clientSpecificRequests = data.clientSpecificRequests ?? []

  const [briefExpanded, setBriefExpanded] = useState(false)
  const [isReprocessing, setIsReprocessing] = useState(false)

  // Extract relevant brief portions for the background field
  const backgroundExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'background') : null,
    [rawBriefText]
  )

  // Check if extractedData differs from current data
  const hasExtractedDiff =
    extractedData &&
    (
      (extractedData.brandName && extractedData.brandName !== brandName) ||
      (extractedData.brandBrief && extractedData.brandBrief !== brandBrief) ||
      (extractedData.brandObjective && extractedData.brandObjective !== brandObjective) ||
      (extractedData.brandPainPoints && extractedData.brandPainPoints.length > 0 &&
        JSON.stringify(extractedData.brandPainPoints) !== JSON.stringify(brandPainPoints))
    )

  const applyExtracted = useCallback(() => {
    if (!extractedData) return
    onChange({
      ...data,
      brandName: extractedData.brandName || brandName,
      brandBrief: extractedData.brandBrief || brandBrief,
      brandPainPoints: extractedData.brandPainPoints?.length
        ? extractedData.brandPainPoints
        : brandPainPoints,
      brandObjective: extractedData.brandObjective || brandObjective,
    })
  }, [extractedData, data, onChange, brandName, brandBrief, brandPainPoints, brandObjective])

  const addPainPoint = useCallback(() => {
    onChange({
      ...data,
      brandPainPoints: [...brandPainPoints, ''],
    })
  }, [data, onChange, brandPainPoints])

  const removePainPoint = useCallback(
    (index: number) => {
      const updated = brandPainPoints.filter((_, i) => i !== index)
      onChange({ ...data, brandPainPoints: updated })
    },
    [data, onChange, brandPainPoints]
  )

  const updatePainPoint = useCallback(
    (index: number, value: string) => {
      const updated = [...brandPainPoints]
      updated[index] = value
      onChange({ ...data, brandPainPoints: updated })
    },
    [data, onChange, brandPainPoints]
  )

  const addMetric = useCallback(() => {
    onChange({ ...data, successMetrics: [...successMetrics, ''] })
  }, [data, onChange, successMetrics])

  const removeMetric = useCallback((index: number) => {
    onChange({ ...data, successMetrics: successMetrics.filter((_, i) => i !== index) })
  }, [data, onChange, successMetrics])

  const updateMetric = useCallback((index: number, value: string) => {
    const updated = [...successMetrics]
    updated[index] = value
    onChange({ ...data, successMetrics: updated })
  }, [data, onChange, successMetrics])

  const handleReprocessBrief = useCallback(async () => {
    if (!rawBriefText || isReprocessing) return
    setIsReprocessing(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reprocess_field',
          params: {
            fieldName: 'brandBrief',
            currentValue: brandBrief,
            briefExcerpt: rawBriefText.slice(0, 3000),
            fullBriefContext: `${brandName}: ${brandBrief}`,
            fieldInstructions: 'סכם את הרקע העסקי מהבריף המקורי בצורה מקצועית ומקיפה. שלב את כל הפרטים החשובים מהמסמך המקורי.'
          }
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.value) {
          onChange({ ...data, brandBrief: result.value })
        }
      }
    } catch (err) {
      console.error('[StepBrief] Reprocess error:', err)
    } finally {
      setIsReprocessing(false)
    }
  }, [rawBriefText, isReprocessing, brandBrief, brandName, data, onChange])

  return (
    <div dir="rtl" className="space-y-10">

      {/* ── Original Brief Document ── */}
      {rawBriefText && (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-6 shadow-wizard-sm">
          <div className="flex items-center gap-3 mb-4">
            <DocumentIcon />
            <h3 className="text-base font-heebo font-bold text-wizard-text-primary">
              הבריף המקורי של הלקוח
            </h3>
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-rubik font-medium text-amber-700">
              מסמך מקור
            </span>
          </div>
          <div
            className={`overflow-y-auto rounded-xl bg-white/70 p-4 border border-amber-100 text-sm text-wizard-text-secondary leading-relaxed whitespace-pre-wrap transition-all duration-300 ${
              briefExpanded ? 'max-h-[600px]' : 'max-h-[200px]'
            }`}
          >
            {rawBriefText}
          </div>
          <div className="mt-3 flex items-center gap-4">
            {rawBriefText.length > 500 && (
              <button
                onClick={() => setBriefExpanded(!briefExpanded)}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors underline-offset-2 hover:underline"
              >
                {briefExpanded ? 'הצג פחות' : 'הרחב את הבריף...'}
              </button>
            )}
            <span className="text-[11px] text-amber-600/70 font-rubik">
              {rawBriefText.length.toLocaleString()} תווים
            </span>
          </div>

          {/* Kickoff document (collapsible) */}
          {rawKickoffText && (
            <details className="mt-4">
              <summary className="text-sm font-heebo font-semibold text-wizard-text-secondary cursor-pointer hover:text-wizard-text-primary transition-colors">
                מסמך התנעה פנימי ({rawKickoffText.length.toLocaleString()} תווים)
              </summary>
              <div className="mt-2 max-h-[200px] overflow-y-auto rounded-xl bg-white/70 p-4 border border-amber-100 text-sm text-wizard-text-secondary leading-relaxed whitespace-pre-wrap">
                {rawKickoffText}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Section divider ── */}
      {rawBriefText && (
        <div className="h-px bg-gradient-to-l from-transparent via-wizard-border to-transparent" />
      )}

      {/* ── Extracted data banner ── */}
      {hasExtractedDiff && (
        <div className="relative rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-5 overflow-hidden shadow-wizard-sm">
          <div className="absolute top-0 right-0 bottom-0 w-1 bg-gradient-to-b from-brand-gold to-brand-primary" />
          <h3 className="text-sm font-heebo font-bold text-wizard-text-primary mb-3">
            המערכת חילצה את המידע הבא מהבריף
          </h3>
          <div className="space-y-1.5">
            {extractedData.brandName && extractedData.brandName !== brandName && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">שם מותג:</span> {extractedData.brandName}
              </p>
            )}
            {extractedData.brandBrief && extractedData.brandBrief !== brandBrief && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">רקע:</span>{' '}
                {extractedData.brandBrief.length > 120
                  ? extractedData.brandBrief.slice(0, 120) + '...'
                  : extractedData.brandBrief}
              </p>
            )}
            {extractedData.brandObjective && extractedData.brandObjective !== brandObjective && (
              <p className="text-[13px] text-wizard-text-secondary">
                <span className="font-heebo font-semibold">מטרה:</span> {extractedData.brandObjective}
              </p>
            )}
            {extractedData.brandPainPoints &&
              extractedData.brandPainPoints.length > 0 &&
              JSON.stringify(extractedData.brandPainPoints) !== JSON.stringify(brandPainPoints) && (
                <p className="text-[13px] text-wizard-text-secondary">
                  <span className="font-heebo font-semibold">נקודות כאב:</span>{' '}
                  {extractedData.brandPainPoints.map((p: unknown) => typeof p === 'string' ? p : ((p as {title?: string})?.title || '')).join(', ')}
                </p>
              )}
          </div>
          <Button
            variant="ai"
            size="sm"
            onClick={applyExtracted}
            className="mt-4"
          >
            החל מידע מחולץ
          </Button>
        </div>
      )}

      {/* ── Brand Name ── */}
      <Input
        label="שם המותג"
        placeholder="הזינו את שם המותג..."
        value={brandName}
        onChange={(e) => onChange({ ...data, brandName: e.target.value })}
        error={errors?.brandName}
      />

      {/* ── Brand Brief (with dual field) ── */}
      <DualFieldSection
        label="רקע ובריף"
        briefQuote={backgroundExcerpt}
        briefQuoteTitle="רקע מהבריף המקורי"
        onReprocess={rawBriefText ? handleReprocessBrief : undefined}
        isReprocessing={isReprocessing}
        reprocessLabel="עבד מחדש עם AI"
      >
        <Textarea
          placeholder="תארו את רקע המותג והבריף שהתקבל..."
          value={brandBrief}
          onChange={(e) => onChange({ ...data, brandBrief: e.target.value })}
          error={errors?.brandBrief}
          className="min-h-[150px]"
        />
      </DualFieldSection>

      {/* ── Section divider ── */}
      <div className="h-px bg-gradient-to-l from-transparent via-wizard-border to-transparent" />

      {/* ── Pain Points ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            נקודות כאב של המותג
          </label>
          <Button variant="ghost" size="sm" onClick={addPainPoint} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף נקודת כאב</span>
          </Button>
        </div>

        {errors?.brandPainPoints && (
          <p className="text-xs text-destructive">{errors.brandPainPoints}</p>
        )}

        {brandPainPoints.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-wizard-border/50 bg-brand-pearl/30 p-6 text-center">
            <p className="text-sm text-wizard-text-tertiary">
              לא נוספו נקודות כאב. לחצו על &quot;הוסף נקודת כאב&quot; להתחיל.
            </p>
          </div>
        )}

        {brandPainPoints.map((point, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`נקודת כאב ${index + 1}`}
              value={typeof point === 'string' ? point : (point as {title?: string})?.title || ''}
              onChange={(e) => updatePainPoint(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removePainPoint(index)}
              className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        ))}
      </div>

      {/* ── Brand Objective ── */}
      <Input
        label="מטרת המותג"
        placeholder="מהי המטרה העיקרית של הפנייה?"
        value={brandObjective}
        onChange={(e) => onChange({ ...data, brandObjective: e.target.value })}
        error={errors?.brandObjective}
      />

      {/* ── Section divider ── */}
      <div className="h-px bg-gradient-to-l from-transparent via-wizard-border to-transparent" />

      {/* ── Success Metrics ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            מדדי הצלחה (מהבריף)
          </label>
          <Button variant="ghost" size="sm" onClick={addMetric} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף מדד</span>
          </Button>
        </div>

        {successMetrics.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-wizard-border/50 bg-brand-pearl/30 p-6 text-center">
            <p className="text-sm text-wizard-text-tertiary">
              לא נמצאו מדדי הצלחה בבריף. הוסיפו ידנית אם יש.
            </p>
          </div>
        )}

        {successMetrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              placeholder={`מדד הצלחה ${index + 1}`}
              value={metric}
              onChange={(e) => updateMetric(index, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeMetric(index)}
              className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        ))}
      </div>

      {/* ── Client Specific Requests ── */}
      {clientSpecificRequests.length > 0 && (
        <div className="rounded-2xl border border-wizard-border bg-brand-pearl/40 p-5 shadow-wizard-sm">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em] mb-3">
            דרישות ספציפיות מהלקוח
          </label>
          <ul className="space-y-1.5">
            {clientSpecificRequests.map((req, i) => (
              <li key={i} className="text-[13px] text-wizard-text-secondary flex items-start gap-2">
                <span className="text-brand-primary mt-0.5">•</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Research Context ── */}
      {brandResearch && (
        <ResearchContext
          title="ממצאי מחקר מותג"
          items={[
            { label: 'תיאור החברה', value: brandResearch.companyDescription as string },
            { label: 'תעשייה', value: [brandResearch.industry as string, brandResearch.subIndustry as string].filter(Boolean).join(' / ') || undefined },
            { label: 'ערכי מותג', value: brandResearch.brandValues as string[] },
            { label: 'הבטחת המותג', value: brandResearch.brandPromise as string },
            { label: 'למה עכשיו?', value: brandResearch.whyNowTrigger as string },
            { label: 'אישיות המותג', value: brandResearch.brandPersonality as string[] },
          ]}
        />
      )}
    </div>
  )
}
