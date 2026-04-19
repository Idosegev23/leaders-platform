'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import type { StrategyStepData, AiVersionEntry } from '@/types/wizard'
import AiVersionNavigator from '../ai-version-navigator'
import BriefQuotePanel from '../brief-quote-panel'
import { extractBriefExcerpt } from '../brief-excerpt-utils'
import ResearchContext from '../research-context'

interface StepStrategyProps {
  data: Partial<StrategyStepData>
  extractedData: Partial<StrategyStepData>
  onChange: (data: Partial<StrategyStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  rawBriefText?: string
  brandResearch?: Record<string, unknown> | null
  aiVersionHistory?: Record<string, { versions: AiVersionEntry[]; currentIndex: number }>
  onPushVersion?: (key: string, data: Record<string, unknown>, source: 'ai' | 'research' | 'manual') => void
  onNavigateVersion?: (key: string, direction: 'prev' | 'next') => void
}

export default function StepStrategy({ data, extractedData, onChange, errors, briefContext, rawBriefText, brandResearch, aiVersionHistory, onPushVersion, onNavigateVersion }: StepStrategyProps) {
  const strategyHeadline = data.strategyHeadline ?? ''
  const strategyDescription = data.strategyDescription ?? ''
  const strategyPillars = data.strategyPillars ?? []
  const strategyFlow = data.strategyFlow ?? { steps: [] }
  const [isGeneratingFlow, setIsGeneratingFlow] = useState(false)

  const strategyExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'strategy') : null,
    [rawBriefText]
  )
  const [isRefiningPillars, setIsRefiningPillars] = useState(false)
  const [refiningPillarIndex, setRefiningPillarIndex] = useState<number | null>(null)

  const handleGenerateFlow = useCallback(async () => {
    setIsGeneratingFlow(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_strategy_flow',
          strategyHeadline,
          strategyPillars: strategyPillars.map(p => `${p.title}: ${p.description}`).join(', '),
          briefContext: briefContext || '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.steps?.length) {
          onChange({ ...data, strategyFlow: { steps: result.steps } })
          onPushVersion?.('strategy.flow', { strategyFlow: { steps: result.steps } }, 'ai')
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsGeneratingFlow(false)
    }
  }, [strategyHeadline, strategyPillars, briefContext, data, onChange, onPushVersion])

  const handleRefineAllPillars = useCallback(async () => {
    if (strategyPillars.length === 0) return
    setIsRefiningPillars(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine_strategy_pillars',
          strategyHeadline,
          pillars: JSON.stringify(strategyPillars),
          briefContext: briefContext || '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.pillars?.length) {
          onChange({ ...data, strategyPillars: result.pillars })
          onPushVersion?.('strategy.pillars', { strategyPillars: result.pillars }, 'ai')
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsRefiningPillars(false)
    }
  }, [strategyHeadline, strategyPillars, briefContext, data, onChange, onPushVersion])

  const handleRefineSinglePillar = useCallback(async (index: number) => {
    const pillar = strategyPillars[index]
    if (!pillar) return
    setRefiningPillarIndex(index)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine_strategy_pillars',
          strategyHeadline,
          pillars: JSON.stringify([pillar]),
          briefContext: briefContext || '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.pillars?.[0]) {
          const updated = [...strategyPillars]
          updated[index] = result.pillars[0]
          onChange({ ...data, strategyPillars: updated })
        }
      }
    } catch {
      // Silent fail
    } finally {
      setRefiningPillarIndex(null)
    }
  }, [strategyHeadline, strategyPillars, briefContext, data, onChange])

  const addPillar = useCallback(() => {
    onChange({
      ...data,
      strategyPillars: [...strategyPillars, { title: '', description: '' }],
    })
  }, [data, onChange, strategyPillars])

  const removePillar = useCallback(
    (index: number) => {
      const updated = strategyPillars.filter((_, i) => i !== index)
      onChange({ ...data, strategyPillars: updated })
    },
    [data, onChange, strategyPillars]
  )

  const updatePillar = useCallback(
    (index: number, field: 'title' | 'description', value: string) => {
      const updated = [...strategyPillars]
      updated[index] = { ...updated[index], [field]: value }
      onChange({ ...data, strategyPillars: updated })
    },
    [data, onChange, strategyPillars]
  )

  return (
    <div dir="rtl" className="space-y-10">
      {/* Brief quote for strategy */}
      {strategyExcerpt && (
        <BriefQuotePanel
          title="הקשר אסטרטגי מהבריף"
          briefExcerpt={strategyExcerpt}
        />
      )}

      {/* Strategy Headline */}
      <div className="space-y-2">
        <Input
          label="כותרת האסטרטגיה"
          placeholder="משפט אסטרטגי שמגדיר את כיוון הפעילות"
          value={strategyHeadline}
          onChange={(e) => onChange({ ...data, strategyHeadline: e.target.value })}
          error={errors?.strategyHeadline}
        />
        <div className="rounded-xl bg-brand-pearl/60 p-3">
          <p className="text-xs text-wizard-text-tertiary mb-1 font-heebo font-medium">דוגמאות:</p>
          <ul className="text-xs text-wizard-text-tertiary space-y-0.5 list-disc list-inside">
            <li>נייצר מהלך מודעות רחב שיפעל ב-2 שלבים</li>
            <li>נרים קמפיין שיגע בכמה עולמות תוכן</li>
            <li>ניצור נוכחות דיגיטלית שמובילה מחשיפה להמרה</li>
          </ul>
        </div>
      </div>

      {/* Strategy Description */}
      <Textarea
        label="תיאור האסטרטגיה (אופציונלי)"
        placeholder="פרטו את הגישה האסטרטגית, ההיגיון ותהליך העבודה..."
        value={strategyDescription}
        onChange={(e) => onChange({ ...data, strategyDescription: e.target.value })}
        error={errors?.strategyDescription}
        className="min-h-[120px]"
      />

      {/* Strategy Pillars */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
              עמודי תווך אסטרטגיים
            </label>
            {aiVersionHistory?.['strategy.pillars'] && onNavigateVersion && (
              <AiVersionNavigator
                versions={aiVersionHistory['strategy.pillars'].versions}
                currentIndex={aiVersionHistory['strategy.pillars'].currentIndex}
                onNavigate={(dir) => onNavigateVersion('strategy.pillars', dir)}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {strategyPillars.length > 0 && (
              <Button
                variant="ai"
                size="sm"
                onClick={handleRefineAllPillars}
                disabled={isRefiningPillars}
                className="gap-1.5"
              >
                {isRefiningPillars ? (
                  <>
                    <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                    <span>מחדד...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                    <span>חדד את כולם</span>
                  </>
                )}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={addPillar} className="gap-1.5">
              <span className="text-base leading-none">+</span>
              <span>הוסף עמוד תווך</span>
            </Button>
          </div>
        </div>

        {errors?.strategyPillars && (
          <p className="text-xs text-destructive">{errors.strategyPillars}</p>
        )}

        {strategyPillars.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-wizard-border p-8 text-center">
            <p className="text-sm text-wizard-text-tertiary mb-2">
              לא הוספו עמודי תווך עדיין
            </p>
            <p className="text-xs text-wizard-text-tertiary">
              עמודי תווך הם הנדבכים המרכזיים של האסטרטגיה — כל אחד מהם נושא חלק ממהלך הפעילות
            </p>
          </div>
        )}

        {strategyPillars.map((pillar, index) => (
          <div
            key={index}
            className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-rubik font-medium text-wizard-text-tertiary tracking-wide">
                עמוד תווך {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRefineSinglePillar(index)}
                  disabled={refiningPillarIndex === index || !pillar.title}
                  className="gap-1 text-brand-primary hover:bg-brand-primary/5 text-xs px-2 h-7"
                >
                  {refiningPillarIndex === index ? (
                    <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                    </svg>
                  )}
                  <span>שפר</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removePillar(index)}
                  className="text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10 text-xs px-2 h-7"
                >
                  הסר
                </Button>
              </div>
            </div>

            <Input
              placeholder="כותרת עמוד התווך"
              value={pillar.title}
              onChange={(e) => updatePillar(index, 'title', e.target.value)}
            />

            <Textarea
              placeholder="תיאור עמוד התווך — מה כולל, איך מתבצע, מה המטרה..."
              value={pillar.description}
              onChange={(e) => updatePillar(index, 'description', e.target.value)}
              className="min-h-[80px]"
            />
          </div>
        ))}
      </div>

      {/* ── Research Context ── */}
      {brandResearch && (
        <ResearchContext
          title="ממצאי מחקר אסטרטגיים"
          items={(() => {
            const competitors = brandResearch.competitors as { name: string; description?: string }[] | undefined
            return [
              { label: 'מיצוב שוק', value: brandResearch.marketPosition as string },
              { label: 'יתרונות תחרותיים', value: brandResearch.competitiveAdvantages as string[] },
              { label: 'מתחרים מרכזיים', value: competitors?.map(c => c.description ? `${c.name} — ${c.description}` : c.name) },
              { label: 'גישה מומלצת', value: brandResearch.suggestedApproach as string },
              { label: 'הקשר שוק ישראלי', value: brandResearch.israeliMarketContext as string },
            ]
          })()}
        />
      )}

      {/* Strategy Flow Visualization */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            תהליך עבודה (Flow)
          </label>
          <Button
            variant="ai"
            size="sm"
            onClick={handleGenerateFlow}
            disabled={isGeneratingFlow || !strategyHeadline}
            className="gap-1.5"
          >
            {isGeneratingFlow ? (
              <>
                <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                <span>מייצר Flow...</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <span>ייצר Flow עם AI</span>
              </>
            )}
          </Button>
        </div>

        {strategyFlow.steps.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 px-1">
            {strategyFlow.steps.map((step, index) => (
              <React.Fragment key={index}>
                <div className="flex-shrink-0 w-40 rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-3 text-center">
                  <div className="text-2xl mb-1">{step.icon || '🔹'}</div>
                  <p className="text-sm font-heebo font-bold text-wizard-text-primary">{step.label}</p>
                  <p className="text-xs text-wizard-text-tertiary mt-1 leading-tight">{step.description}</p>
                </div>
                {index < strategyFlow.steps.length - 1 && (
                  <svg className="w-5 h-5 text-wizard-text-tertiary/30 flex-shrink-0 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-sm text-wizard-text-tertiary">
            לחצו &quot;ייצר Flow עם AI&quot; כדי ליצור תהליך עבודה ויזואלי מהאסטרטגיה
          </p>
        )}
      </div>
    </div>
  )
}
