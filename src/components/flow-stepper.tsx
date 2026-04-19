'use client'

/**
 * FlowStepper — Shared component showing overall pipeline flow.
 * Used across: research, wizard, generate, edit pages.
 *
 * Flow: העלאה → מחקר → עריכת הצעה → יצירת מצגת → תצוגה מקדימה
 */

import { cn } from '@/lib/utils'

export type FlowStep = 'upload' | 'research' | 'wizard' | 'generate' | 'edit'

const FLOW_STEPS: { key: FlowStep; label: string }[] = [
  { key: 'upload', label: 'העלאה' },
  { key: 'research', label: 'מחקר' },
  { key: 'wizard', label: 'עריכת הצעה' },
  { key: 'generate', label: 'יצירת מצגת' },
  { key: 'edit', label: 'עורך' },
]

interface FlowStepperProps {
  currentStep: FlowStep
  /** Compact mode for tight headers */
  compact?: boolean
}

export default function FlowStepper({ currentStep, compact = false }: FlowStepperProps) {
  const currentIdx = FLOW_STEPS.findIndex(s => s.key === currentStep)

  return (
    <div dir="rtl" className={cn(
      'flex items-center justify-center gap-1',
      compact ? 'py-0' : 'py-2',
    )}>
      {FLOW_STEPS.map((step, i) => {
        const isDone = i < currentIdx
        const isActive = i === currentIdx
        const isPending = i > currentIdx

        return (
          <div key={step.key} className="flex items-center gap-1 shrink-0">
            {/* Step pill */}
            <div className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all',
              compact && 'px-1.5 py-0.5 text-[9px]',
              isDone && 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
              isActive && 'bg-primary text-primary-foreground shadow-sm',
              isPending && 'bg-muted text-muted-foreground/40',
            )}>
              {isDone ? (
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className={cn(
                  'w-3 h-3 flex items-center justify-center rounded-full text-[8px] leading-none font-bold',
                  isActive && 'bg-primary-foreground/20',
                  isPending && 'bg-muted-foreground/10',
                )}>
                  {i + 1}
                </span>
              )}
              <span className="whitespace-nowrap">{step.label}</span>
            </div>

            {/* Connector */}
            {i < FLOW_STEPS.length - 1 && (
              <div className={cn(
                'h-px w-3 transition-colors',
                compact && 'w-2',
                isDone ? 'bg-green-400/50' : 'bg-border',
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
