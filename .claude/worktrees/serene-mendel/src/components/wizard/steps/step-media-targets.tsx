'use client'

import React, { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MediaTargetsStepData } from '@/types/wizard'

interface StepMediaTargetsProps {
  data: Partial<MediaTargetsStepData>
  extractedData: Partial<MediaTargetsStepData>
  onChange: (data: Partial<MediaTargetsStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  successMetrics?: string[]
}

const CURRENCY_OPTIONS = [
  { value: '₪', label: '₪ (שקל)' },
  { value: '$', label: '$ (דולר)' },
  { value: '€', label: '€ (אירו)' },
]

export default function StepMediaTargets({
  data,
  extractedData,
  onChange,
  errors,
  successMetrics,
}: StepMediaTargetsProps) {
  const budget = data.budget ?? 0
  const currency = data.currency ?? '₪'
  const potentialReach = data.potentialReach ?? 0
  const potentialEngagement = data.potentialEngagement ?? 0
  const cpe = data.cpe ?? 0
  const cpm = data.cpm ?? undefined
  const estimatedImpressions = data.estimatedImpressions ?? undefined
  const metricsExplanation = data.metricsExplanation ?? ''

  // Auto-calculate CPE
  const calculatedCpe = useMemo(() => {
    if (budget > 0 && potentialEngagement > 0) {
      return Math.round((budget / potentialEngagement) * 100) / 100
    }
    return 0
  }, [budget, potentialEngagement])

  // Determine displayed CPE: use manual override if set, otherwise calculated
  const displayedCpe = cpe > 0 ? cpe : calculatedCpe

  // CPE formula display
  const cpeFormula = useMemo(() => {
    if (budget > 0 && potentialEngagement > 0) {
      return `${budget.toLocaleString('he-IL')} ${currency} / ${potentialEngagement.toLocaleString('he-IL')} = ${calculatedCpe} ${currency}`
    }
    return ''
  }, [budget, potentialEngagement, currency, calculatedCpe])

  return (
    <div dir="rtl" className="space-y-10">
      {/* Success metrics from brief */}
      {successMetrics && successMetrics.length > 0 && (
        <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-4">
          <h3 className="text-[13px] font-heebo font-bold text-wizard-text-primary mb-2">
            מדדי הצלחה מהבריף
          </h3>
          <ul className="space-y-1">
            {successMetrics.map((metric, i) => (
              <li key={i} className="text-[13px] text-wizard-text-secondary flex items-start gap-2">
                <span className="text-brand-primary mt-0.5">✓</span>
                <span>{metric}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Budget and Currency */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-4">
        <Input
          label="תקציב"
          type="number"
          min={0}
          value={budget || ''}
          onChange={(e) =>
            onChange({ ...data, budget: parseInt(e.target.value) || 0 })
          }
          error={errors?.budget}
          placeholder="הזינו את תקציב הקמפיין"
        />

        <Select
          label="מטבע"
          options={CURRENCY_OPTIONS}
          value={currency}
          onChange={(e) => onChange({ ...data, currency: e.target.value })}
          error={errors?.currency}
        />
      </div>

      {/* Reach and Engagement */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="חשיפה צפויה (Reach)"
          type="number"
          min={0}
          value={potentialReach || ''}
          onChange={(e) =>
            onChange({ ...data, potentialReach: parseInt(e.target.value) || 0 })
          }
          error={errors?.potentialReach}
          placeholder="מספר אנשים ייחודיים"
        />

        <Input
          label="מעורבות צפויה (Engagement)"
          type="number"
          min={0}
          value={potentialEngagement || ''}
          onChange={(e) =>
            onChange({
              ...data,
              potentialEngagement: parseInt(e.target.value) || 0,
            })
          }
          error={errors?.potentialEngagement}
          placeholder="לייקים, תגובות, שמירות..."
        />
      </div>

      {/* CPE */}
      <Card className="border-wizard-border bg-brand-pearl/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-heebo">CPE — עלות למעורבות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <Input
              label="CPE"
              type="number"
              min={0}
              step={0.01}
              value={displayedCpe || ''}
              onChange={(e) =>
                onChange({
                  ...data,
                  cpe: parseFloat(e.target.value) || 0,
                })
              }
              error={errors?.cpe}
              placeholder="עלות למעורבות"
            />

            {cpeFormula && (
              <div className="rounded-lg bg-background p-3 text-sm text-muted-foreground">
                <span className="text-xs font-medium block mb-1">נוסחה:</span>
                <span className="font-mono text-xs">{cpeFormula}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            CPE מחושב אוטומטית מתקציב חלקי מעורבות. ניתן לערוך ידנית.
          </p>
        </CardContent>
      </Card>

      {/* Optional metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="CPM (אופציונלי)"
          type="number"
          min={0}
          step={0.01}
          value={cpm ?? ''}
          onChange={(e) =>
            onChange({
              ...data,
              cpm: e.target.value ? parseFloat(e.target.value) : undefined,
            })
          }
          error={errors?.cpm}
          placeholder="עלות לאלף חשיפות"
          hint="עלות ל-1,000 חשיפות"
        />

        <Input
          label="חשיפות משוערות (אופציונלי)"
          type="number"
          min={0}
          value={estimatedImpressions ?? ''}
          onChange={(e) =>
            onChange({
              ...data,
              estimatedImpressions: e.target.value
                ? parseInt(e.target.value)
                : undefined,
            })
          }
          error={errors?.estimatedImpressions}
          placeholder="סה״כ חשיפות"
        />
      </div>

      {/* Explanation */}
      <Textarea
        label="הסבר על מדדים (אופציונלי)"
        placeholder="הסבירו כיצד חושבו המדדים, ממה מורכב ה-Reach, מה כולל ה-Engagement..."
        value={metricsExplanation}
        onChange={(e) => onChange({ ...data, metricsExplanation: e.target.value })}
        error={errors?.metricsExplanation}
        className="min-h-[100px]"
      />
    </div>
  )
}
