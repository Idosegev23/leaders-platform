'use client'

import React, { useCallback, useState, useRef, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GoalsStepData } from '@/types/wizard'
import BriefQuotePanel from '../brief-quote-panel'
import { extractBriefExcerpt } from '../brief-excerpt-utils'

interface StepGoalsProps {
  data: Partial<GoalsStepData>
  extractedData: Partial<GoalsStepData>
  onChange: (data: Partial<GoalsStepData>) => void
  errors: Record<string, string> | null
  briefContext?: string
  rawBriefText?: string
}

const PREDEFINED_GOALS = [
  { title: 'מודעות', subtitle: 'חשיפה רחבה למותג' },
  { title: 'חינוך שוק', subtitle: 'הבנת הערך של המוצר' },
  { title: 'נוכחות דיגיטלית', subtitle: 'נראות ברשתות החברתיות' },
  { title: 'נחשקות ו-FOMO', subtitle: 'יצירת ביקוש ותחושת דחיפות' },
  { title: 'הנעה למכר', subtitle: 'המרה ישירה לקנייה' },
  { title: 'השקת מוצר', subtitle: 'בנייה לחשיפה ראשונה' },
  { title: 'חיזוק נאמנות', subtitle: 'העמקת קשר עם לקוחות קיימים' },
]

export default function StepGoals({ data, extractedData, onChange, errors, briefContext, rawBriefText }: StepGoalsProps) {
  const goals = data.goals ?? []
  const customGoals = data.customGoals ?? []
  const targets = data.targets ?? []
  const [newCustomGoal, setNewCustomGoal] = useState('')
  const [loadingGoals, setLoadingGoals] = useState<Set<string>>(new Set())

  const goalsExcerpt = useMemo(
    () => rawBriefText ? extractBriefExcerpt(rawBriefText, 'goals') : null,
    [rawBriefText]
  )

  // Batch generation: collect newly-added goals and generate in bulk
  const pendingBatchRef = useRef<string[]>([])
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isGoalSelected = useCallback(
    (title: string) => goals.some((g) => g.title === title),
    [goals]
  )

  // Batch description generation
  const flushBatchGeneration = useCallback(async (titles: string[], currentGoals: { title: string; description: string }[]) => {
    if (titles.length === 0) return
    const needDescription = titles.filter(t => {
      const goal = currentGoals.find(g => g.title === t)
      return goal && !goal.description
    })
    if (needDescription.length === 0) return

    setLoadingGoals(prev => {
      const next = new Set(prev)
      for (const t of needDescription) next.add(t)
      return next
    })

    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: needDescription.length === 1 ? 'generate_goal_description' : 'generate_goal_descriptions_batch',
          ...(needDescription.length === 1
            ? { goalTitle: needDescription[0], briefContext: briefContext || '' }
            : { goalTitles: needDescription, briefContext: briefContext || '' }),
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (needDescription.length === 1 && result.description) {
          onChange({
            ...data,
            goals: currentGoals.map(g =>
              g.title === needDescription[0] && !g.description
                ? { ...g, description: result.description }
                : g
            ),
          })
        } else if (result.descriptions) {
          onChange({
            ...data,
            goals: currentGoals.map(g => {
              if (!g.description && result.descriptions[g.title]) {
                return { ...g, description: result.descriptions[g.title] }
              }
              return g
            }),
          })
        }
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingGoals(prev => {
        const next = new Set(prev)
        for (const t of needDescription) next.delete(t)
        return next
      })
    }
  }, [briefContext, data, onChange])

  const scheduleBatchGeneration = useCallback((title: string, currentGoals: { title: string; description: string }[]) => {
    pendingBatchRef.current.push(title)
    if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    batchTimerRef.current = setTimeout(() => {
      const titles = [...pendingBatchRef.current]
      pendingBatchRef.current = []
      flushBatchGeneration(titles, currentGoals)
    }, 500)
  }, [flushBatchGeneration])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current)
    }
  }, [])

  const toggleGoal = useCallback(
    (title: string) => {
      if (isGoalSelected(title)) {
        onChange({
          ...data,
          goals: goals.filter((g) => g.title !== title),
        })
      } else {
        const newGoals = [...goals, { title, description: '' }]
        onChange({
          ...data,
          goals: newGoals,
        })
        scheduleBatchGeneration(title, newGoals)
      }
    },
    [data, onChange, goals, isGoalSelected, scheduleBatchGeneration]
  )

  const updateGoalDescription = useCallback(
    (title: string, description: string) => {
      const updated = goals.map((g) => (g.title === title ? { ...g, description } : g))
      onChange({ ...data, goals: updated })
    },
    [data, onChange, goals]
  )

  const addCustomGoal = useCallback(() => {
    const trimmed = newCustomGoal.trim()
    if (!trimmed) return
    const newGoals = [...goals, { title: trimmed, description: '' }]
    onChange({
      ...data,
      customGoals: [...customGoals, trimmed],
      goals: newGoals,
    })
    setNewCustomGoal('')
    scheduleBatchGeneration(trimmed, newGoals)
  }, [data, onChange, customGoals, goals, newCustomGoal, scheduleBatchGeneration])

  const removeCustomGoal = useCallback(
    (goalText: string) => {
      onChange({
        ...data,
        customGoals: customGoals.filter((g) => g !== goalText),
        goals: goals.filter((g) => g.title !== goalText),
      })
    },
    [data, onChange, customGoals, goals]
  )

  // Targets management
  const addTarget = useCallback(() => {
    onChange({ ...data, targets: [...targets, { metric: '', value: '', timeline: '' }] })
  }, [data, onChange, targets])

  const removeTarget = useCallback((index: number) => {
    onChange({ ...data, targets: targets.filter((_, i) => i !== index) })
  }, [data, onChange, targets])

  const updateTarget = useCallback((index: number, field: 'metric' | 'value' | 'timeline', value: string) => {
    const updated = [...targets]
    updated[index] = { ...updated[index], [field]: value }
    onChange({ ...data, targets: updated })
  }, [data, onChange, targets])

  return (
    <div dir="rtl" className="space-y-10">
      {/* Brief quote for goals */}
      {goalsExcerpt && (
        <BriefQuotePanel
          title="מה הלקוח כתב על המטרות"
          briefExcerpt={goalsExcerpt}
        />
      )}

      {/* Goal selection header */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            מטרות הקמפיין
          </label>
          {goals.length > 0 && (
            <span className="rounded-full bg-brand-gold/10 px-3 py-1 text-xs font-heebo font-bold text-brand-primary">
              נבחרו {goals.length} מטרות
            </span>
          )}
        </div>

        {errors?.goals && (
          <p className="text-xs text-destructive mb-3">{errors.goals}</p>
        )}

        {/* Card-style goal buttons (2 columns) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {PREDEFINED_GOALS.map((goal) => {
            const selected = isGoalSelected(goal.title)
            return (
              <button
                key={goal.title}
                type="button"
                onClick={() => toggleGoal(goal.title)}
                className={cn(
                  'relative flex items-start gap-3 rounded-2xl border p-4 text-right transition-all duration-200',
                  selected
                    ? 'border-brand-primary bg-brand-primary/5 shadow-wizard-sm'
                    : 'border-wizard-border bg-white hover:border-brand-primary/30 hover:shadow-wizard-sm'
                )}
              >
                {/* Checkbox icon */}
                <div className={cn(
                  'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200',
                  selected
                    ? 'border-brand-primary bg-brand-primary'
                    : 'border-wizard-border'
                )}>
                  {selected && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={cn(
                    'text-sm font-heebo font-bold',
                    selected ? 'text-brand-primary' : 'text-wizard-text-primary'
                  )}>
                    {goal.title}
                  </p>
                  <p className="text-xs text-wizard-text-tertiary mt-0.5">
                    {goal.subtitle}
                  </p>
                </div>
              </button>
            )
          })}

          {/* Custom goal chips within the grid */}
          {customGoals
            .filter((cg) => !PREDEFINED_GOALS.some(pg => pg.title === cg))
            .map((goal) => {
              const selected = isGoalSelected(goal)
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGoal(goal)}
                  className={cn(
                    'relative flex items-start gap-3 rounded-2xl border p-4 text-right transition-all duration-200',
                    selected
                      ? 'border-brand-primary bg-brand-primary/5 shadow-wizard-sm'
                      : 'border-wizard-border bg-white hover:border-brand-primary/30 hover:shadow-wizard-sm'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200',
                    selected ? 'border-brand-primary bg-brand-primary' : 'border-wizard-border'
                  )}>
                    {selected && (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-heebo font-bold', selected ? 'text-brand-primary' : 'text-wizard-text-primary')}>
                      {typeof goal === 'string' ? goal : (goal as {title?: string})?.title || ''}
                    </p>
                    <p className="text-xs text-wizard-text-tertiary mt-0.5">מטרה מותאמת אישית</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeCustomGoal(goal) }}
                    className="absolute top-2 left-2 w-5 h-5 rounded-full text-wizard-text-tertiary hover:text-destructive hover:bg-destructive/10 flex items-center justify-center text-xs transition-colors"
                  >
                    ×
                  </button>
                </button>
              )
            })}

          {/* Add custom goal CTA card */}
          <div className="flex items-center gap-2 rounded-2xl border-2 border-dashed border-wizard-border p-4 hover:border-brand-primary/30 transition-colors">
            <Input
              placeholder="הוסיפו מטרה מותאמת..."
              value={newCustomGoal}
              onChange={(e) => setNewCustomGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCustomGoal()
                }
              }}
              className="border-0 shadow-none p-0 h-auto focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={addCustomGoal}
              disabled={!newCustomGoal.trim()}
              className="shrink-0 text-brand-primary font-bold"
            >
              +
            </Button>
          </div>
        </div>

        {/* Selected goals with description textareas */}
        {goals.length > 0 && (
          <div className="space-y-4">
            <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
              פירוט מטרות נבחרות
            </label>
            {goals.map((goal) => (
              <div
                key={goal.title}
                className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heebo font-bold text-sm text-wizard-text-primary">{goal.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleGoal(goal.title)}
                    className="text-wizard-text-tertiary hover:text-destructive text-xs"
                  >
                    הסר
                  </Button>
                </div>
                <div className="relative">
                  <Textarea
                    placeholder={loadingGoals.has(goal.title) ? 'AI מייצר תיאור...' : `פרטו את מטרת ה${goal.title}...`}
                    value={goal.description}
                    onChange={(e) => updateGoalDescription(goal.title, e.target.value)}
                    className="min-h-[80px]"
                  />
                  {loadingGoals.has(goal.title) && (
                    <div className="absolute top-3 left-3">
                      <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Measurable Targets section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
            יעדים מדידים
          </label>
          <Button variant="ghost" size="sm" onClick={addTarget} className="gap-1.5">
            <span className="text-base leading-none">+</span>
            <span>הוסף יעד</span>
          </Button>
        </div>

        {targets.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-wizard-border p-6 text-center">
            <p className="text-sm text-wizard-text-tertiary mb-1">
              לא הוגדרו יעדים מדידים
            </p>
            <p className="text-xs text-wizard-text-tertiary">
              יעדים מדידים עוזרים להראות ללקוח מה בדיוק הוא מקבל — למשל &quot;10K עוקבים חדשים תוך 3 חודשים&quot;
            </p>
          </div>
        )}

        {targets.map((target, index) => (
          <div
            key={index}
            className="rounded-2xl border border-wizard-border bg-white shadow-wizard-sm p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-rubik font-medium text-wizard-text-tertiary">
                יעד {index + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTarget(index)}
                className="text-wizard-text-tertiary hover:text-destructive text-xs px-2 h-7"
              >
                הסר
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                placeholder="מדד (למשל: עוקבים חדשים)"
                value={target.metric}
                onChange={(e) => updateTarget(index, 'metric', e.target.value)}
              />
              <Input
                placeholder="ערך (למשל: 10,000)"
                value={target.value}
                onChange={(e) => updateTarget(index, 'value', e.target.value)}
              />
              <Input
                placeholder="ציר זמן (למשל: 3 חודשים)"
                value={target.timeline}
                onChange={(e) => updateTarget(index, 'timeline', e.target.value)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
