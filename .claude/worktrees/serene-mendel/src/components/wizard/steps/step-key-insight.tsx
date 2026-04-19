'use client'

import React, { useCallback, useState, useMemo } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { KeyInsightStepData, AiVersionEntry } from '@/types/wizard'
import AiVersionNavigator from '../ai-version-navigator'
import BriefQuotePanel from '../brief-quote-panel'
import { extractBriefExcerpt } from '../brief-excerpt-utils'
import ResearchContext from '../research-context'

interface StepKeyInsightProps {
  data: Partial<KeyInsightStepData>
  extractedData: Partial<KeyInsightStepData>
  onChange: (data: Partial<KeyInsightStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  rawBriefText?: string
  brandResearch?: Record<string, unknown> | null
  aiVersionHistory?: Record<string, { versions: AiVersionEntry[]; currentIndex: number }>
  onPushVersion?: (key: string, data: Record<string, unknown>, source: 'ai' | 'research' | 'manual') => void
  onNavigateVersion?: (key: string, direction: 'prev' | 'next') => void
}

export default function StepKeyInsight({
  data,
  extractedData,
  onChange,
  errors,
  briefContext,
  rawBriefText,
  brandResearch,
  aiVersionHistory,
  onPushVersion,
  onNavigateVersion,
}: StepKeyInsightProps) {
  const keyInsight = data.keyInsight ?? ''
  const insightSource = data.insightSource ?? ''
  const insightData = data.insightData ?? ''
  const [isRefining, setIsRefining] = useState(false)

  const insightExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'insight') : null,
    [rawBriefText]
  )

  const handleRefineWithAI = useCallback(async () => {
    setIsRefining(true)
    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refine_insight',
          currentInsight: keyInsight,
          briefContext: briefContext || '',
          audienceContext: '',
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.keyInsight) {
          const newData = {
            keyInsight: result.keyInsight,
            insightSource: result.insightSource || insightSource,
            insightData: result.supportingResearch?.map(
              (r: { statistic: string; source: string; year?: string }) =>
                `${r.statistic} (${r.source}${r.year ? `, ${r.year}` : ''})`
            ).join('\n') || insightData,
          }
          onChange({ ...data, ...newData })
          onPushVersion?.('key_insight.insight', newData, 'ai')
        }
      }
    } catch {
      // Silent fail
    } finally {
      setIsRefining(false)
    }
  }, [keyInsight, briefContext, data, onChange, insightSource, insightData])

  const hasExtractedInsight =
    extractedData?.keyInsight && extractedData.keyInsight !== keyInsight

  const applyExtracted = useCallback(() => {
    if (!extractedData) return
    onChange({
      ...data,
      keyInsight: extractedData.keyInsight || keyInsight,
      insightSource: extractedData.insightSource || insightSource,
      insightData: extractedData.insightData || insightData,
    })
  }, [extractedData, data, onChange, keyInsight, insightSource, insightData])

  return (
    <div dir="rtl" className="space-y-6">
      {/* Brief quote for insight */}
      {insightExcerpt && (
        <BriefQuotePanel
          title="הקשר רלוונטי מהבריף"
          briefExcerpt={insightExcerpt}
        />
      )}

      {/* Extracted insight banner */}
      {hasExtractedInsight && (
        <Card className="border-wizard-border bg-brand-pearl/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-wizard-text-primary">
              תובנה שחולצה מהבריף:
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-wizard-text-secondary leading-relaxed">
              {extractedData.keyInsight}
            </p>
            {extractedData.insightSource && (
              <p className="text-xs text-wizard-text-tertiary">
                <span className="font-semibold">מקור:</span> {extractedData.insightSource}
              </p>
            )}
            <Button
              variant="ai"
              size="sm"
              onClick={applyExtracted}
              className="mt-2"
            >
              החל תובנה מחולצת
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Creative connection hint */}
      <div className="rounded-2xl border border-wizard-border bg-brand-pearl/50 px-4 py-3">
        <p className="text-[13px] text-wizard-text-secondary leading-relaxed">
          <span className="font-heebo font-semibold">טיפ:</span> התובנה צריכה להסביר <strong>למה</strong> הגישה הקריאייטיבית שנציע היא הנכונה. חשבו על זה כגשר לוגי בין הכאב של הקהל לפתרון שנציע.
        </p>
      </div>

      {/* Key Insight */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">התובנה המרכזית</label>
            {aiVersionHistory?.['key_insight.insight'] && onNavigateVersion && (
              <AiVersionNavigator
                versions={aiVersionHistory['key_insight.insight'].versions}
                currentIndex={aiVersionHistory['key_insight.insight'].currentIndex}
                onNavigate={(dir) => onNavigateVersion('key_insight.insight', dir)}
              />
            )}
          </div>
          <Button
            variant="ai"
            size="sm"
            onClick={handleRefineWithAI}
            disabled={isRefining}
            className="gap-1.5"
          >
            {isRefining ? (
              <>
                <div className="w-3 h-3 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                מחדד עם AI...
              </>
            ) : (
              'חדד עם AI + מחקר'
            )}
          </Button>
        </div>
        <Textarea
          placeholder="מהי התובנה שמבססת את כל הפעילות?"
          value={keyInsight}
          onChange={(e) => onChange({ ...data, keyInsight: e.target.value })}
          error={errors?.keyInsight}
          className="min-h-[160px] text-base"
        />
        <p className="text-xs text-wizard-text-tertiary leading-relaxed">
          למה נכון למותג לעשות את מה שאנחנו הולכים להציע? לאן אנחנו רוצים להביא את הקהל?
        </p>
      </div>

      {/* Insight Source */}
      <Input
        label="מקור התובנה"
        placeholder="מחקר שוק, נתוני Google Trends, סקר לקוחות..."
        value={insightSource}
        onChange={(e) => onChange({ ...data, insightSource: e.target.value })}
        error={errors?.insightSource}
        hint="ציינו מהו המקור שממנו נגזרה התובנה"
      />

      {/* Supporting Data */}
      <Textarea
        label="נתונים תומכים (אופציונלי)"
        placeholder="נתונים, מספרים ומחקרים שתומכים בתובנה..."
        value={insightData}
        onChange={(e) => onChange({ ...data, insightData: e.target.value })}
        error={errors?.insightData}
        className="min-h-[100px]"
      />

      {/* ── Research Context ── */}
      {brandResearch && (
        <ResearchContext
          title="הקשר שוק ומחקר"
          items={[
            { label: 'הקשר שוק ישראלי', value: brandResearch.israeliMarketContext as string },
            { label: 'טרנדים בתעשייה', value: brandResearch.industryTrends as string[] },
            { label: 'פער תחרותי', value: brandResearch.competitiveGap as string },
            { label: 'למה עכשיו?', value: brandResearch.whyNowTrigger as string },
          ]}
        />
      )}
    </div>
  )
}
