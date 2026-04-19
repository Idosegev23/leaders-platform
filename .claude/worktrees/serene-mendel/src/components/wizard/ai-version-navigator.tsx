'use client'

import { cn } from '@/lib/utils'
import type { AiVersionEntry } from '@/types/wizard'

interface AiVersionNavigatorProps {
  versions: AiVersionEntry[]
  currentIndex: number
  onNavigate: (direction: 'prev' | 'next') => void
}

const SOURCE_LABELS: Record<string, string> = {
  ai: 'AI',
  research: 'מחקר',
  manual: 'ידני',
}

const SOURCE_COLORS: Record<string, string> = {
  ai: 'bg-brand-gold/10 text-brand-primary',
  research: 'bg-[#10b981]/10 text-[#10b981]',
  manual: 'bg-brand-pearl text-wizard-text-secondary',
}

export default function AiVersionNavigator({ versions, currentIndex, onNavigate }: AiVersionNavigatorProps) {
  if (versions.length <= 1) return null

  const current = versions[currentIndex]
  const canPrev = currentIndex > 0
  const canNext = currentIndex < versions.length - 1

  return (
    <div className="flex items-center gap-2 rounded-xl border border-wizard-border bg-white/80 px-3 py-1.5 shadow-wizard-sm">
      <button
        type="button"
        onClick={() => onNavigate('prev')}
        disabled={!canPrev}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
          canPrev ? 'text-wizard-text-secondary hover:bg-brand-pearl' : 'text-wizard-text-tertiary/40 cursor-not-allowed'
        )}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <span className="text-[11px] font-rubik text-wizard-text-secondary tabular-nums">
        {currentIndex + 1}/{versions.length}
      </span>

      <button
        type="button"
        onClick={() => onNavigate('next')}
        disabled={!canNext}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-lg transition-colors',
          canNext ? 'text-wizard-text-secondary hover:bg-brand-pearl' : 'text-wizard-text-tertiary/40 cursor-not-allowed'
        )}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {current && (
        <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-rubik font-medium', SOURCE_COLORS[current.source] || SOURCE_COLORS.manual)}>
          {SOURCE_LABELS[current.source] || current.source}
        </span>
      )}
    </div>
  )
}
