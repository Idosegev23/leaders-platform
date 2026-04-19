'use client'

import { cn } from '@/lib/utils'
import BriefQuotePanel from './brief-quote-panel'
import { Button } from '@/components/ui/button'

interface DualFieldSectionProps {
  label: string
  briefQuote?: string | null
  briefQuoteTitle?: string
  children: React.ReactNode
  onReprocess?: () => void
  isReprocessing?: boolean
  reprocessLabel?: string
  className?: string
}

function SparklesIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  )
}

function LoadingSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}

export default function DualFieldSection({
  label,
  briefQuote,
  briefQuoteTitle,
  children,
  onReprocess,
  isReprocessing,
  reprocessLabel,
  className,
}: DualFieldSectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Label row with optional AI button */}
      <div className="flex items-center justify-between">
        <label className="block text-[13px] font-heebo font-semibold text-wizard-text-secondary tracking-[0.01em]">
          {label}
        </label>
        {onReprocess && (
          <Button
            variant="ai"
            size="sm"
            onClick={onReprocess}
            disabled={isReprocessing}
            className="gap-2 rounded-xl"
          >
            {isReprocessing ? <LoadingSpinner /> : <SparklesIcon />}
            {reprocessLabel || 'חדד עם AI'}
          </Button>
        )}
      </div>

      {/* Content: brief quote + editable field */}
      {briefQuote ? (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4">
          <BriefQuotePanel
            title={briefQuoteTitle || 'מהבריף המקורי'}
            briefExcerpt={briefQuote}
          />
          <div>{children}</div>
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  )
}
