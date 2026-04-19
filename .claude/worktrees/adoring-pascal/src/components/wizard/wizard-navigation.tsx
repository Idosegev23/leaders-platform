'use client'

import type { WizardStepId } from '@/types/wizard'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface WizardNavigationProps {
  currentStep: WizardStepId
  isFirstStep: boolean
  isLastStep: boolean
  isRequired: boolean
  isGenerating?: boolean
  onBack: () => void
  onSkip: () => void
  onContinue: () => void
  onGenerate: () => void
}

function ArrowRightIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 5l7 7m0 0l-7 7m7-7H3"
      />
    </svg>
  )
}

function ArrowLeftIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 19l-7-7m0 0l7-7m-7 7h18"
      />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  )
}

export default function WizardNavigation({
  currentStep,
  isFirstStep,
  isLastStep,
  isRequired,
  isGenerating,
  onBack,
  onSkip,
  onContinue,
  onGenerate,
}: WizardNavigationProps) {
  return (
    <nav
      dir="rtl"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'border-t border-wizard-border bg-white/95 backdrop-blur-xl shadow-nav-up',
        'px-6 py-5'
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        {/* Right side (RTL): Back button */}
        <div className="flex items-center">
          <Button
            variant="outline"
            size="md"
            onClick={onBack}
            disabled={isFirstStep}
            className="gap-2 rounded-xl border-wizard-border bg-white px-5 py-3 text-wizard-text-secondary hover:text-wizard-text-primary hover:bg-brand-pearl shadow-wizard-sm"
          >
            <ArrowRightIcon />
            <span>הקודם</span>
          </Button>
        </div>

        {/* Center: Skip button (only if step is not required) */}
        <div className="flex items-center">
          {!isRequired && !isLastStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSkip}
              className="text-wizard-text-tertiary hover:text-wizard-text-secondary"
            >
              דלג על שלב זה
            </Button>
          )}
        </div>

        {/* Left side (RTL): Continue or Generate button */}
        <div className="flex items-center">
          {isLastStep ? (
            <Button
              variant="premium"
              size="md"
              onClick={onGenerate}
              disabled={isGenerating}
              className="relative gap-2 rounded-xl px-8 py-3 font-heebo text-base font-bold overflow-hidden disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>יוצר הצעה...</span>
                </>
              ) : (
                <>
                  <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
                  <SparklesIcon />
                  <span>צור הצעה</span>
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={onContinue}
              className="gap-2 rounded-xl px-8 py-3 font-heebo text-base font-bold shadow-wizard-md hover:shadow-wizard-lg"
            >
              <span>המשך</span>
              <ArrowLeftIcon />
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}
