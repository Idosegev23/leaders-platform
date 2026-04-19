'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TargetAudienceStepData } from '@/types/wizard'
import BriefQuotePanel from '../brief-quote-panel'
import { extractBriefExcerpt } from '../brief-excerpt-utils'
import ResearchContext from '../research-context'

interface AudienceInsight {
  text: string
  source?: string
  sourceUrl?: string
  dataPoint?: string
  confidence?: 'high' | 'medium' | 'low'
}

interface StepTargetAudienceProps {
  data: Partial<TargetAudienceStepData>
  extractedData: Partial<TargetAudienceStepData>
  onChange: (data: Partial<TargetAudienceStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  rawBriefText?: string
  brandResearch?: Record<string, unknown> | null
}

const GENDER_OPTIONS = [
  { value: '', label: 'בחרו מגדר...' },
  { value: 'נשים', label: 'נשים' },
  { value: 'גברים', label: 'גברים' },
  { value: 'שניהם', label: 'שניהם' },
]

export default function StepTargetAudience({
  data,
  extractedData,
  onChange,
  errors,
  briefContext,
  rawBriefText,
  brandResearch,
}: StepTargetAudienceProps) {
  const targetGender = data.targetGender ?? ''
  const targetAgeRange = data.targetAgeRange ?? ''
  const targetDescription = data.targetDescription ?? ''
  const targetBehavior = data.targetBehavior ?? ''
  const targetInsights = data.targetInsights ?? []
  const targetSecondary = data.targetSecondary ?? null

  const [showSecondary, setShowSecondary] = useState(!!targetSecondary)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)

  const audienceExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'audience') : null,
    [rawBriefText]
  )

  const handleGenerateInsights = useCallback(async () => {
    if (!targetGender && !targetAgeRange) return
    setIsGeneratingInsights(true)
    try {
      const brandParts = briefContext?.split(':') || []
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_audience_insights',
          gender: targetGender,
          ageRange: targetAgeRange,
          description: targetDescription,
          brandName: brandParts[0]?.trim() || '',
          industry: '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.insights?.length) {
          // Add AI insights as structured objects
          const newInsights = [...targetInsights, ...result.insights.map((i: AudienceInsight) =>
            i.source ? JSON.stringify(i) : i.text
          )]
          onChange({ ...data, targetInsights: newInsights })
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsGeneratingInsights(false)
    }
  }, [targetGender, targetAgeRange, targetDescription, briefContext, targetInsights, data, onChange])

  const addInsight = useCallback(() => {
    onChange({
      ...data,
      targetInsights: [...targetInsights, ''],
    })
  }, [data, onChange, targetInsights])

  const removeInsight = useCallback(
    (index: number) => {
      const updated = targetInsights.filter((_, i) => i !== index)
      onChange({ ...data, targetInsights: updated })
    },
    [data, onChange, targetInsights]
  )

  const updateInsight = useCallback(
    (index: number, value: string) => {
      const updated = [...targetInsights]
      updated[index] = value
      onChange({ ...data, targetInsights: updated })
    },
    [data, onChange, targetInsights]
  )

  const toggleSecondary = useCallback(() => {
    if (showSecondary) {
      setShowSecondary(false)
      onChange({ ...data, targetSecondary: undefined })
    } else {
      setShowSecondary(true)
      onChange({
        ...data,
        targetSecondary: targetSecondary ?? {
          gender: '',
          ageRange: '',
          description: '',
        },
      })
    }
  }, [showSecondary, data, onChange, targetSecondary])

  const updateSecondaryField = useCallback(
    (field: 'gender' | 'ageRange' | 'description', value: string) => {
      onChange({
        ...data,
        targetSecondary: {
          gender: targetSecondary?.gender ?? '',
          ageRange: targetSecondary?.ageRange ?? '',
          description: targetSecondary?.description ?? '',
          [field]: value,
        },
      })
    },
    [data, onChange, targetSecondary]
  )

  return (
    <div dir="rtl" className="space-y-10">
      {/* Brief quote for audience */}
      {audienceExcerpt && (
        <BriefQuotePanel
          title="מה הלקוח כתב על קהל היעד"
          briefExcerpt={audienceExcerpt}
        />
      )}

      {/* Primary audience */}
      <div className="space-y-4">
        <h3 className="text-lg font-heebo font-bold text-wizard-text-primary">קהל יעד ראשי</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="מגדר"
            options={GENDER_OPTIONS}
            value={targetGender}
            onChange={(e) => onChange({ ...data, targetGender: e.target.value })}
            error={errors?.targetGender}
          />

          <Input
            label="טווח גילאים"
            placeholder="לדוגמה: 25-34"
            value={targetAgeRange}
            onChange={(e) => onChange({ ...data, targetAgeRange: e.target.value })}
            error={errors?.targetAgeRange}
          />
        </div>

        <Textarea
          label="תיאור קהל היעד"
          placeholder="תארו את קהל היעד - סגנון חיים, תחומי עניין, ערכים..."
          value={targetDescription}
          onChange={(e) => onChange({ ...data, targetDescription: e.target.value })}
          error={errors?.targetDescription}
          className="min-h-[120px]"
        />

        <Textarea
          label="התנהגות צרכנית"
          placeholder="כיצד הקהל מתנהג ברשתות? מה הם צורכים? איך הם מקבלים החלטות?"
          value={targetBehavior}
          onChange={(e) => onChange({ ...data, targetBehavior: e.target.value })}
          error={errors?.targetBehavior}
          className="min-h-[100px]"
        />

        {/* Insights */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
              תובנות על קהל היעד
            </label>
            <div className="flex gap-2">
              <Button
                variant="ai"
                size="sm"
                onClick={handleGenerateInsights}
                disabled={isGeneratingInsights || (!targetGender && !targetAgeRange)}
                className="gap-1.5"
              >
                {isGeneratingInsights ? (
                  <>
                    <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                    מחפש תובנות...
                  </>
                ) : (
                  'חפש תובנות AI'
                )}
              </Button>
              <Button variant="ghost" size="sm" onClick={addInsight}>
                + הוסף תובנה
              </Button>
            </div>
          </div>

          {errors?.targetInsights && (
            <p className="text-xs text-destructive">{errors.targetInsights}</p>
          )}

          {targetInsights.length === 0 && (
            <p className="text-sm text-wizard-text-tertiary">
              לא נוספו תובנות. לחצו על &quot;הוסף תובנה&quot; להתחיל.
            </p>
          )}

          {targetInsights.map((insight, index) => {
            // Try to parse structured insight (AI-generated)
            let parsed: AudienceInsight | null = null
            if (typeof insight === 'string' && insight.startsWith('{')) {
              try { parsed = JSON.parse(insight) } catch { /* not JSON */ }
            }

            if (parsed?.source) {
              return (
                <div key={index} className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-3 space-y-1.5 relative group">
                  <p className="text-sm font-medium text-wizard-text-primary pr-6">{parsed.text}</p>
                  {parsed.dataPoint && (
                    <p className="text-xs text-brand-gold font-semibold">{parsed.dataPoint}</p>
                  )}
                  <p className="text-xs text-wizard-text-tertiary">
                    {parsed.sourceUrl ? (
                      <a href={parsed.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-wizard-text-primary">
                        {parsed.source}
                      </a>
                    ) : parsed.source}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeInsight(index)}
                    className="absolute top-2 left-2 shrink-0 text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18" /><path d="M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
              )
            }

            return (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder={`תובנה ${index + 1}`}
                  value={typeof insight === 'string' ? insight : (insight as {title?: string; name?: string})?.title || (insight as {name?: string})?.name || ''}
                  onChange={(e) => updateInsight(index, e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeInsight(index)}
                  className="shrink-0 text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Secondary audience */}
      <div className="border-t border-wizard-border pt-4">
        <button
          type="button"
          onClick={toggleSecondary}
          className="flex items-center gap-2 text-sm font-heebo font-semibold text-wizard-text-primary hover:text-brand-primary transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn('transition-transform duration-200', showSecondary && 'rotate-90')}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          קהל יעד משני (אופציונלי)
        </button>

        {showSecondary && (
          <div className="mt-4 space-y-4 rounded-2xl border border-wizard-border bg-brand-pearl/40 p-5">
            <Select
              label="מגדר"
              options={GENDER_OPTIONS}
              value={targetSecondary?.gender ?? ''}
              onChange={(e) => updateSecondaryField('gender', e.target.value)}
            />

            <Input
              label="טווח גילאים"
              placeholder="לדוגמה: 18-24"
              value={targetSecondary?.ageRange ?? ''}
              onChange={(e) => updateSecondaryField('ageRange', e.target.value)}
            />

            <Textarea
              label="תיאור"
              placeholder="תארו את קהל היעד המשני..."
              value={targetSecondary?.description ?? ''}
              onChange={(e) => updateSecondaryField('description', e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        )}
      </div>

      {/* ── Research Context ── */}
      {brandResearch && (
        <ResearchContext
          title="ממצאי מחקר קהל יעד"
          items={(() => {
            const td = brandResearch.targetDemographics as { primaryAudience?: { socioeconomic?: string; lifestyle?: string; aspirations?: string[]; interests?: string[] }; purchaseDrivers?: string[] } | undefined
            return [
              { label: 'רמה סוציו-אקונומית', value: td?.primaryAudience?.socioeconomic as string },
              { label: 'אורח חיים', value: td?.primaryAudience?.lifestyle as string },
              { label: 'שאיפות', value: td?.primaryAudience?.aspirations as string[] },
              { label: 'תחומי עניין', value: td?.primaryAudience?.interests as string[] },
              { label: 'מניעי רכישה', value: td?.purchaseDrivers as string[] },
            ]
          })()}
        />
      )}
    </div>
  )
}
