'use client'

import { useRef, useEffect } from 'react'
import type { WizardStepId, StepStatus } from '@/types/wizard'
import { WIZARD_STEPS } from './wizard-constants'
import { cn } from '@/lib/utils'

interface WizardProgressProps {
  currentStep: WizardStepId
  stepStatuses: Record<WizardStepId, StepStatus>
  onGoToStep: (step: WizardStepId) => void
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

export default function WizardProgress({
  currentStep,
  stepStatuses,
  onGoToStep,
}: WizardProgressProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  // Scroll to active step when it changes
  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current
      const activeEl = activeRef.current
      const containerRect = container.getBoundingClientRect()
      const activeRect = activeEl.getBoundingClientRect()

      if (
        activeRect.right > containerRect.right ||
        activeRect.left < containerRect.left
      ) {
        activeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        })
      }
    }
  }, [currentStep])

  function getStepStatus(stepId: WizardStepId): StepStatus {
    if (stepId === currentStep) return 'active'
    return stepStatuses[stepId]
  }

  function isClickable(status: StepStatus): boolean {
    return status === 'completed' || status === 'skipped' || status === 'active'
  }

  function handleStepClick(stepId: WizardStepId) {
    const status = getStepStatus(stepId)
    if (isClickable(status)) {
      onGoToStep(stepId)
    }
  }

  // Check if the step AFTER index is completed (for connecting line fill)
  function isLineCompleted(index: number): boolean {
    if (index >= WIZARD_STEPS.length - 1) return false
    const currentStepStatus = getStepStatus(WIZARD_STEPS[index].id)
    return currentStepStatus === 'completed' || currentStepStatus === 'skipped'
  }

  return (
    <div dir="rtl" className="border-b border-white/10 bg-gradient-to-l from-[#0f172a] via-[#1e1b4b] to-[#020617] px-4 py-5 md:px-8">
      <div
        ref={scrollRef}
        className="mx-auto flex max-w-3xl items-start justify-between overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-0 pb-6"
      >
        {WIZARD_STEPS.map((step, index) => {
          const status = getStepStatus(step.id)
          const clickable = isClickable(status)
          const isActive = step.id === currentStep
          const lineCompleted = isLineCompleted(index)

          return (
            <div key={step.id} className="flex items-start snap-center shrink-0">
              {/* Step node */}
              <div className="relative flex flex-col items-center">
                <button
                  ref={isActive ? activeRef : undefined}
                  type="button"
                  onClick={() => handleStepClick(step.id)}
                  disabled={!clickable}
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-xl text-xs font-rubik font-bold',
                    'transition-all duration-500',
                    // Active
                    isActive && 'bg-[#f2cc0d] text-[#0f172a] shadow-[0_0_15px_rgba(242,204,13,0.4)] scale-110',
                    // Completed
                    !isActive && status === 'completed' && 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/30 cursor-pointer hover:bg-[#10b981]/30',
                    // Skipped
                    !isActive && status === 'skipped' && 'border-2 border-dashed border-white/20 bg-transparent text-white/40 cursor-pointer',
                    // Pending
                    status === 'pending' && 'bg-white/5 text-white/25 border border-white/5 cursor-not-allowed',
                  )}
                  title={step.label}
                  aria-label={`${step.label} - ${getStatusLabel(status)}`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {status === 'completed' && !isActive ? (
                    <CheckIcon className="text-[#10b981]" />
                  ) : isActive ? (
                    <span>{step.order}</span>
                  ) : (
                    <span>{step.order}</span>
                  )}
                </button>

                {/* Label below circle */}
                <span
                  className={cn(
                    'absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-heebo',
                    isActive ? 'font-bold text-[#f2cc0d]' :
                    status === 'completed' ? 'font-medium text-[#10b981]' :
                    'font-medium text-white/40'
                  )}
                >
                  {step.labelShort}
                </span>
              </div>

              {/* Connecting line between steps */}
              {index < WIZARD_STEPS.length - 1 && (
                <div className="relative mx-1 mt-4 h-[2px] w-6 md:w-10 shrink-0">
                  {/* Background track */}
                  <div className="absolute inset-0 rounded-full bg-white/10" />
                  {/* Fill */}
                  <div
                    className={cn(
                      'absolute inset-y-0 right-0 rounded-full transition-all duration-500',
                      lineCompleted
                        ? 'w-full bg-gradient-to-l from-[#10b981] to-[#047857]'
                        : 'w-0'
                    )}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function getStatusLabel(status: StepStatus): string {
  switch (status) {
    case 'active':
      return 'שלב נוכחי'
    case 'completed':
      return 'הושלם'
    case 'skipped':
      return 'דולג'
    case 'pending':
      return 'ממתין'
  }
}
