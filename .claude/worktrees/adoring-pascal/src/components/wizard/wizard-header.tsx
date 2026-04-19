'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import FlowStepper from '@/components/flow-stepper'

interface WizardHeaderProps {
  brandName: string
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: string | null
  onExit: () => void
}

function formatSavedTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WizardHeader({
  brandName,
  isDirty,
  isSaving,
  lastSavedAt,
  onExit,
}: WizardHeaderProps) {
  const router = useRouter()

  function handleExit() {
    if (isDirty) {
      const confirmed = window.confirm(
        'יש שינויים שלא נשמרו. האם אתה בטוח שברצונך לצאת?'
      )
      if (!confirmed) return
    }
    onExit()
    router.push('/dashboard')
  }

  function getSaveStatusText(): string {
    if (isSaving) return 'שומר...'
    if (isDirty) return 'שינויים לא שמורים'
    return 'נשמר'
  }

  return (
    <header
      dir="rtl"
      className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-wizard-border bg-white/90 px-4 shadow-wizard-sm backdrop-blur-xl sm:px-6"
    >
      {/* Right side: Brand icon + name */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary shadow-wizard-sm">
          <span className="text-xs font-heebo font-bold text-white">
            {(brandName || 'H').charAt(0)}
          </span>
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-heebo font-bold leading-tight text-wizard-text-primary">
            {brandName || 'הצעה חדשה'}
          </h1>
          <span className="text-[11px] font-rubik text-wizard-text-tertiary tracking-wide">
            אשף יצירת הצעה
          </span>
        </div>
      </div>

      {/* Center: Flow stepper + Save status */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="hidden md:block">
          <FlowStepper currentStep="wizard" compact />
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full transition-all duration-300',
              isSaving && 'animate-pulse bg-[#f2cc0d] w-3',
              !isSaving && isDirty && 'bg-[#f2cc0d]/60',
              !isSaving && !isDirty && 'bg-[#10b981]'
            )}
          />
          <span className={cn(
            'text-[11px] font-medium transition-colors',
            isSaving && 'text-[#f2cc0d]',
            !isSaving && isDirty && 'text-[#f2cc0d]/70',
            !isSaving && !isDirty && 'text-wizard-text-tertiary'
          )}>
            {getSaveStatusText()}
          </span>
          {lastSavedAt && !isDirty && !isSaving && (
            <span className="text-[11px] text-wizard-text-tertiary">
              ({formatSavedTime(lastSavedAt)})
            </span>
          )}
        </div>
      </div>

      {/* Left side: Exit button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleExit}
        className="gap-1.5 rounded-xl border border-wizard-border px-3 py-1.5 text-wizard-text-secondary hover:text-wizard-text-primary hover:bg-brand-pearl"
      >
        <span>יציאה</span>
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </Button>
    </header>
  )
}
