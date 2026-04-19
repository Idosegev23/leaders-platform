'use client'

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { QuantitiesStepData } from '@/types/wizard'

interface StepQuantitiesProps {
  data: Partial<QuantitiesStepData>
  extractedData: Partial<QuantitiesStepData>
  onChange: (data: Partial<QuantitiesStepData>) => void
  errors: Record<string, string> | null
}

export default function StepQuantities({
  data,
  extractedData,
  onChange,
  errors,
}: StepQuantitiesProps) {
  const influencerCount = data.influencerCount ?? 0
  const campaignDurationMonths = data.campaignDurationMonths ?? 1
  const contentTypes = data.contentTypes ?? []

  // Ref to track if this is the initial mount (skip first effect)
  const isInitialMount = useRef(true)

  // Deterministic recalculation when influencerCount or campaignDurationMonths change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (contentTypes.length === 0) return

    const updated = contentTypes.map((ct) => ({
      ...ct,
      totalQuantity: ct.quantityPerInfluencer * influencerCount * campaignDurationMonths,
    }))
    const newTotal = updated.reduce((sum, ct) => sum + ct.totalQuantity, 0)

    // Only update if values actually changed to avoid infinite loops
    const hasChanged = updated.some(
      (ct, i) => ct.totalQuantity !== contentTypes[i].totalQuantity
    )
    if (hasChanged) {
      onChange({
        ...data,
        contentTypes: updated,
        totalDeliverables: newTotal,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [influencerCount, campaignDurationMonths])

  // Computed total (always derived)
  const calculatedTotal = useMemo(() => {
    return contentTypes.reduce((sum, ct) => sum + (ct.totalQuantity || 0), 0)
  }, [contentTypes])

  const formulaString = useMemo(() => {
    if (contentTypes.length === 0) return ''
    const parts = contentTypes.map(
      (ct) =>
        `${ct.type || 'סוג תוכן'}: ${ct.quantityPerInfluencer} × ${influencerCount} משפיענים × ${campaignDurationMonths} חודשים = ${ct.totalQuantity}`
    )
    return parts.join('\n')
  }, [contentTypes, influencerCount, campaignDurationMonths])

  // Add content type
  const addContentType = useCallback(() => {
    onChange({
      ...data,
      contentTypes: [
        ...contentTypes,
        { type: '', quantityPerInfluencer: 1, totalQuantity: influencerCount * campaignDurationMonths },
      ],
    })
  }, [data, onChange, contentTypes, influencerCount, campaignDurationMonths])

  // Remove content type
  const removeContentType = useCallback(
    (index: number) => {
      const updated = contentTypes.filter((_, i) => i !== index)
      const newTotal = updated.reduce((sum, ct) => sum + ct.totalQuantity, 0)
      onChange({ ...data, contentTypes: updated, totalDeliverables: newTotal })
    },
    [data, onChange, contentTypes]
  )

  // Update content type field
  const updateContentType = useCallback(
    (index: number, field: 'type' | 'quantityPerInfluencer', value: string | number) => {
      const updated = [...contentTypes]
      updated[index] = { ...updated[index], [field]: value }

      // Always recalc total for this row
      if (field === 'quantityPerInfluencer') {
        const qty = typeof value === 'number' ? value : parseInt(value) || 0
        updated[index].totalQuantity = qty * influencerCount * campaignDurationMonths
      }

      const newTotal = updated.reduce((sum, ct) => sum + ct.totalQuantity, 0)
      onChange({ ...data, contentTypes: updated, totalDeliverables: newTotal })
    },
    [data, onChange, contentTypes, influencerCount, campaignDurationMonths]
  )

  return (
    <div dir="rtl" className="space-y-10">
      {/* Top-level counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="מספר משפיענים"
          type="number"
          min={0}
          value={influencerCount || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0
            onChange({ ...data, influencerCount: val })
          }}
          error={errors?.influencerCount}
        />

        <Input
          label="משך הקמפיין (חודשים)"
          type="number"
          min={1}
          value={campaignDurationMonths || ''}
          onChange={(e) => {
            const val = parseInt(e.target.value) || 1
            onChange({ ...data, campaignDurationMonths: val })
          }}
          error={errors?.campaignDurationMonths}
        />
      </div>

      {/* Content types */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            סוגי תוכן
          </label>
          <Button variant="ghost" size="sm" onClick={addContentType} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף סוג תוכן</span>
          </Button>
        </div>

        {errors?.contentTypes && (
          <p className="text-xs text-destructive">{errors.contentTypes}</p>
        )}

        {contentTypes.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-wizard-border p-8 text-center">
            <p className="text-sm text-wizard-text-tertiary mb-2">
              לא הוגדרו סוגי תוכן
            </p>
            <p className="text-xs text-wizard-text-tertiary">
              הוסיפו סוגי תוכן כדי לחשב את כמות התוצרים הכוללת
            </p>
          </div>
        )}

        {contentTypes.map((ct, index) => (
          <div
            key={index}
            className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-5 space-y-3"
          >
            <div className="flex items-center gap-3">
              {/* Type */}
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="סוג התוכן (רילז, סטוריז...)"
                  value={ct.type}
                  onChange={(e) => updateContentType(index, 'type', e.target.value)}
                />
              </div>

              {/* Qty per influencer */}
              <div className="w-28 flex-shrink-0">
                <Input
                  type="number"
                  min={0}
                  placeholder="למשפיען"
                  value={ct.quantityPerInfluencer || ''}
                  onChange={(e) =>
                    updateContentType(index, 'quantityPerInfluencer', parseInt(e.target.value) || 0)
                  }
                  hint="למשפיען"
                />
              </div>

              {/* Calculated total (read-only) */}
              <div className="w-24 flex-shrink-0">
                <div className="flex h-12 w-full items-center justify-center rounded-xl border border-wizard-border bg-brand-pearl/50 px-3 text-sm font-heebo font-bold text-wizard-text-primary">
                  {ct.totalQuantity || 0}
                </div>
                <p className="mt-1 text-[10px] text-wizard-text-tertiary text-center">סה&quot;כ</p>
              </div>

              {/* Remove */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeContentType(index)}
                className="text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </Button>
            </div>

            {/* Formula explanation */}
            <p className="text-[11px] text-wizard-text-tertiary font-rubik">
              {ct.quantityPerInfluencer} × {influencerCount} משפיענים × {campaignDurationMonths} חודשים = <span className="font-bold">{ct.totalQuantity}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Grand total */}
      {contentTypes.length > 0 && (
        <Card className="border-wizard-border bg-brand-pearl/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heebo">סיכום כמויות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Formula display */}
            {formulaString && (
              <div className="rounded-xl bg-white/60 p-3 text-xs text-wizard-text-secondary whitespace-pre-line font-rubik leading-relaxed">
                {formulaString}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-brand-primary/10 pt-3">
              <span className="font-heebo font-bold text-wizard-text-primary">סה&quot;כ תוצרים:</span>
              <span className="text-2xl font-heebo font-extrabold text-brand-primary">
                {calculatedTotal}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
