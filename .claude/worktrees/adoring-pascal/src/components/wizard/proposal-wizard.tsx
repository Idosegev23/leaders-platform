'use client'

import {
  useReducer,
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from 'react'
import type { ComponentType } from 'react'
import { useRouter } from 'next/navigation'
import type {
  WizardStepId,
  WizardStepDataMap,
  WizardState,
} from '@/types/wizard'
import { wizardReducer, getInitialWizardState } from './wizard-reducer'
import {
  WIZARD_STEPS,
  WIZARD_STEP_ORDER,
  getStepMeta,
  getStepIndex,
} from './wizard-constants'
import {
  extractedDataToStepData,
  enrichStepData,
  wizardDataToProposalData,
  validateStep,
} from './wizard-utils'
import WizardHeader from './wizard-header'
import WizardProgress from './wizard-progress'
import WizardNavigation from './wizard-navigation'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// Dynamically imported step components
import StepBrief from './steps/step-brief'
import StepGoals from './steps/step-goals'
import StepTargetAudience from './steps/step-target-audience'
import StepKeyInsight from './steps/step-key-insight'
import StepStrategy from './steps/step-strategy'
import StepCreative from './steps/step-creative'
import StepDeliverables from './steps/step-deliverables'
import StepQuantities from './steps/step-quantities'
import StepMediaTargets from './steps/step-media-targets'
import StepInfluencers from './steps/step-influencers'
// Research step removed — now handled by /research/[id] page before wizard

// ---------- Types ----------

interface ProposalWizardProps {
  documentId: string
  initialData: Record<string, unknown>
}

export interface StepProps {
  data: Partial<WizardStepDataMap[WizardStepId]>
  extractedData: Partial<WizardStepDataMap[WizardStepId]>
  onChange: (data: Partial<WizardStepDataMap[WizardStepId]>) => void
  errors: Record<string, string> | null
  briefContext?: string
  rawBriefText?: string
  rawKickoffText?: string
}

// ---------- Step component map ----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STEP_COMPONENTS: Partial<Record<WizardStepId, ComponentType<any>>> = {
  brief: StepBrief,
  goals: StepGoals,
  target_audience: StepTargetAudience,
  key_insight: StepKeyInsight,
  strategy: StepStrategy,
  creative: StepCreative,
  deliverables: StepDeliverables,
  quantities: StepQuantities,
  media_targets: StepMediaTargets,
  influencers: StepInfluencers,
}

// ---------- Auto-save debounce hook ----------

function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  callback: T,
  delayMs: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  return useCallback(
    (...args: unknown[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
      }, delayMs)
    },
    [delayMs]
  ) as T
}

// ---------- Main component ----------

export default function ProposalWizard({
  documentId,
  initialData,
}: ProposalWizardProps) {
  const router = useRouter()

  // Initialize state from saved wizard state or fresh
  const [state, dispatch] = useReducer(wizardReducer, undefined, () => {
    const base = getInitialWizardState()
    base.documentId = documentId

    // Restore persisted wizard state if available (returning user)
    if (initialData._wizardState && (initialData._wizardState as WizardState).lastSavedAt) {
      const saved = initialData._wizardState as WizardState
      return {
        ...saved,
        documentId,
        isDirty: false,
      }
    }

    // New flow: proposal agent generated step data directly
    if (initialData._stepData) {
      let stepData = initialData._stepData as Partial<WizardStepDataMap>

      // Enrich with research data if available
      try {
        stepData = enrichStepData(
          stepData,
          initialData._brandResearch,
          initialData._influencerStrategy,
        )
      } catch (err) {
        console.error('[Wizard] enrichStepData error (non-fatal):', err)
      }

      base.stepData = stepData
      base.extractedData = stepData
    } else if (initialData._extractedData) {
      // Legacy flow: old extraction format
      const extracted = initialData._extractedData as Record<string, unknown>
      const stepData = extractedDataToStepData(
        extracted as unknown as Parameters<typeof extractedDataToStepData>[0]
      )
      base.stepData = stepData
      base.extractedData = stepData
    }

    // Set first step as active
    base.stepStatuses = { ...base.stepStatuses, brief: 'active' }

    return base
  })

  // Raw brief texts — read-only, never edited
  const rawBriefText = useMemo(
    () => (initialData._briefText as string) || '',
    [initialData._briefText]
  )
  const rawKickoffText = useMemo(
    () => (initialData._kickoffText as string) || '',
    [initialData._kickoffText]
  )

  // Research data — read-only, displayed as context in steps
  const brandResearch = useMemo(
    () => (initialData._brandResearch as Record<string, unknown>) || null,
    [initialData._brandResearch]
  )
  const influencerStrategy = useMemo(
    () => (initialData._influencerStrategy as Record<string, unknown>) || null,
    [initialData._influencerStrategy]
  )

  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [stepErrors, setStepErrors] = useState<Record<string, string> | null>(
    null
  )
  const [transitionDir, setTransitionDir] = useState<
    'forward' | 'backward' | null
  >(null)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const prevStepRef = useRef(state.currentStep)

  // ---------- Save logic ----------

  const saveToServer = useCallback(
    async (stateToSave: WizardState) => {
      setIsSaving(true)
      try {
        const payload: Record<string, unknown> = {
          _wizardState: {
            ...stateToSave,
            isDirty: false, // persisted state is never dirty
          },
          _cachedSlides: null, // Invalidate cached slides on any edit
        }

        const res = await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          console.error('[Wizard] Save failed:', res.status)
          toast.error('השמירה נכשלה — נסה שוב')
          return
        }

        dispatch({ type: 'MARK_SAVED', timestamp: new Date().toISOString() })
      } catch (err) {
        console.error('[Wizard] Save error:', err)
        toast.error('שגיאה בשמירה — בדוק את החיבור לאינטרנט')
      } finally {
        setIsSaving(false)
      }
    },
    [documentId]
  )

  // Debounced auto-save (5 seconds after data changes)
  const debouncedSave = useDebouncedCallback(
    (currentState: unknown) => {
      saveToServer(currentState as WizardState)
    },
    5000
  )

  // Trigger debounced save when state becomes dirty
  useEffect(() => {
    if (state.isDirty) {
      debouncedSave(state)
    }
  }, [state, state.isDirty, debouncedSave])

  // ---------- Step data helpers ----------

  const currentStepMeta = useMemo(
    () => getStepMeta(state.currentStep),
    [state.currentStep]
  )

  const currentStepData = useMemo(
    () => (state.stepData[state.currentStep] || {}) as Partial<WizardStepDataMap[WizardStepId]>,
    [state.stepData, state.currentStep]
  )

  const currentExtractedData = useMemo(
    () => (state.extractedData[state.currentStep] || {}) as Partial<WizardStepDataMap[WizardStepId]>,
    [state.extractedData, state.currentStep]
  )

  const brandName = useMemo(() => {
    const brief = state.stepData.brief
    return brief?.brandName || ''
  }, [state.stepData.brief])

  const isFirstStep = state.currentStep === WIZARD_STEP_ORDER[0]
  const isLastStep =
    state.currentStep === WIZARD_STEP_ORDER[WIZARD_STEP_ORDER.length - 1]

  // ---------- Step transition animation ----------

  function animateTransition(direction: 'forward' | 'backward') {
    setTransitionDir(direction)
    setIsTransitioning(true)

    // After the exit animation, the state will have already changed,
    // then we trigger the enter animation
    setTimeout(() => {
      setIsTransitioning(false)
    }, 200)
  }

  // ---------- Navigation handlers ----------

  const handleStepDataChange = useCallback(
    (data: Partial<WizardStepDataMap[WizardStepId]>) => {
      dispatch({
        type: 'UPDATE_STEP_DATA',
        step: state.currentStep,
        data,
      })
      // Clear errors when user edits
      setStepErrors(null)
    },
    [state.currentStep]
  )

  const handleGoToStep = useCallback(
    (step: WizardStepId) => {
      const currentIndex = getStepIndex(state.currentStep)
      const targetIndex = getStepIndex(step)
      const direction = targetIndex > currentIndex ? 'forward' : 'backward'

      // Save before navigating
      if (state.isDirty) {
        saveToServer(state)
      }

      animateTransition(direction)
      setTimeout(() => {
        dispatch({ type: 'GO_TO_STEP', step })
      }, 100)
    },
    [state, saveToServer]
  )

  const handleContinue = useCallback(async () => {
    // Validate current step if required
    if (currentStepMeta.required) {
      const errors = validateStep(state.currentStep, currentStepData)
      if (errors) {
        setStepErrors(errors)
        setTimeout(() => {
          const firstError = document.querySelector('[data-error="true"]')
          firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        return
      }
    }

    // Mark as complete and go next
    dispatch({ type: 'MARK_STEP_COMPLETE', step: state.currentStep })

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('forward')
    setTimeout(() => {
      dispatch({ type: 'NEXT_STEP' })
      setStepErrors(null)
    }, 100)
  }, [state, currentStepMeta, currentStepData, saveToServer, documentId])

  const handleBack = useCallback(() => {
    if (isFirstStep) return

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('backward')
    setTimeout(() => {
      dispatch({ type: 'PREV_STEP' })
      setStepErrors(null)
    }, 100)
  }, [isFirstStep, state, saveToServer])

  const handleSkip = useCallback(() => {
    if (isLastStep) return

    // Save before navigating
    if (state.isDirty) {
      saveToServer(state)
    }

    animateTransition('forward')
    setTimeout(() => {
      dispatch({ type: 'SKIP_STEP' })
      setStepErrors(null)
    }, 100)
  }, [isLastStep, state, saveToServer])

  const handleExit = useCallback(() => {
    // Save before exiting if there are unsaved changes
    if (state.isDirty) {
      saveToServer(state)
    }
  }, [state, saveToServer])

  const handleGenerate = useCallback(async () => {
    // Validate current (last) step if required
    if (currentStepMeta.required) {
      const errors = validateStep(state.currentStep, currentStepData)
      if (errors) {
        setStepErrors(errors)
        setTimeout(() => {
          const firstError = document.querySelector('[data-error="true"]')
          firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        return
      }
    }

    setIsGenerating(true)

    try {
      // Mark last step complete
      dispatch({ type: 'MARK_STEP_COMPLETE', step: state.currentStep })

      // Convert wizard data to proposal data
      const proposalData = wizardDataToProposalData(state.stepData)

      // Save everything: proposal data + wizard state + invalidate cached slides
      const payload = {
        ...proposalData,
        _wizardState: {
          ...state,
          stepStatuses: {
            ...state.stepStatuses,
            [state.currentStep]: 'completed',
          },
          isDirty: false,
        },
        _wizardComplete: true,
        _cachedSlides: null, // Invalidate - will regenerate on visual generation page
        _pipelineStatus: {
          textGeneration: 'complete',
          research: 'complete',
          visualAssets: 'pending',
          slideGeneration: 'pending',
        },
      }

      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to save proposal data')
      }

      dispatch({ type: 'MARK_SAVED', timestamp: new Date().toISOString() })

      // Redirect to visual generation page
      router.push(`/generate/${documentId}`)
    } catch (err) {
      console.error('[Wizard] Generate error:', err)
      toast.error('שגיאה ביצירת ההצעה — נסה שוב')
    } finally {
      setIsGenerating(false)
    }
  }, [state, currentStepMeta, currentStepData, documentId, router])

  // ---------- Render step component ----------

  const StepComponent = STEP_COMPONENTS[state.currentStep]

  // Track previous step for transition direction
  useEffect(() => {
    prevStepRef.current = state.currentStep
  }, [state.currentStep])

  // ---------- Generating overlay ----------

  if (isGenerating) {
    return (
      <div
        dir="rtl"
        className="flex min-h-screen flex-col items-center justify-center gap-8 bg-wizard-bg"
      >
        {/* Multi-ring premium loading animation */}
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-brand-mist animate-ping opacity-20" />
          <div className="absolute inset-2 rounded-full border-2 border-brand-primary/30 animate-spin-slow" />
          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-brand-primary/20 to-brand-gold/20 animate-pulse-soft" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
            </svg>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-heebo font-extrabold text-wizard-text-primary">
            יוצר את ההצעה...
          </h2>
          <p className="mt-3 text-base text-wizard-text-secondary max-w-md">
            ממיר את הנתונים למסמך הצעה מקצועי
          </p>
        </div>
      </div>
    )
  }

  return (
    <div dir="rtl" className="flex min-h-screen flex-col bg-wizard-bg">
      {/* Premium accent line */}
      <div className="h-[2px] w-full bg-gradient-to-l from-brand-primary via-brand-gold to-brand-primary/40" />

      {/* Header */}
      <WizardHeader
        brandName={brandName}
        isDirty={state.isDirty}
        isSaving={isSaving}
        lastSavedAt={state.lastSavedAt}
        onExit={handleExit}
      />

      {/* Progress bar */}
      <WizardProgress
        currentStep={state.currentStep}
        stepStatuses={state.stepStatuses}
        onGoToStep={handleGoToStep}
      />

      {/* Step content area */}
      <main className="flex-1 overflow-y-auto pb-24">
        {/* Step header */}
        <div className="mx-auto max-w-3xl px-6 pt-10 md:px-12 lg:px-16">
          <div className="mb-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-rubik text-xs font-medium tracking-wider text-wizard-text-tertiary">
                שלב {currentStepMeta.order} / {WIZARD_STEPS.length}
              </span>
              {!currentStepMeta.required && (
                <span className="rounded-full bg-brand-mist/60 px-2.5 py-0.5 text-[10px] font-rubik font-semibold uppercase tracking-wider text-wizard-text-tertiary">
                  אופציונלי
                </span>
              )}
              <span className="mr-auto text-[11px] font-rubik text-wizard-text-tertiary">
                הושלמו {WIZARD_STEPS.filter(s => state.stepStatuses[s.id] === 'completed').length} מתוך {WIZARD_STEPS.length} שלבים
              </span>
            </div>
            <h2 className="text-[32px] font-heebo font-extrabold leading-tight tracking-tight text-wizard-text-primary">
              {currentStepMeta.label}
            </h2>
            <p className="mt-2 text-base text-wizard-text-secondary">
              {currentStepMeta.description}
            </p>
            {currentStepMeta.helpText && (
              <div className="mt-4 rounded-xl border border-wizard-border bg-brand-pearl/50 px-4 py-3">
                <p className="text-[13px] text-wizard-text-secondary leading-relaxed">
                  {currentStepMeta.helpText}
                </p>
                {currentStepMeta.whyItMatters && (
                  <p className="mt-1.5 text-[12px] text-wizard-text-tertiary leading-relaxed">
                    <span className="font-heebo font-semibold">למה זה חשוב?</span>{' '}
                    {currentStepMeta.whyItMatters}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Step component with transition */}
        <div className="mx-auto max-w-3xl px-6 md:px-12 lg:px-16">
          <div
            className={cn(
              'transition-all duration-300',
              isTransitioning && 'opacity-0 translate-y-4 scale-[0.99] blur-[4px]',
              !isTransitioning && 'opacity-100 translate-y-0 scale-100 blur-0'
            )}
            style={{ transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)' }}
          >
            {StepComponent && (
              <StepComponent
                data={currentStepData}
                extractedData={currentExtractedData}
                onChange={handleStepDataChange}
                errors={stepErrors}
                briefContext={`${state.stepData.brief?.brandName || ''}: ${state.stepData.brief?.brandBrief || ''}`}
                rawBriefText={rawBriefText}
                rawKickoffText={rawKickoffText}
                successMetrics={state.stepData.brief?.successMetrics}
                aiVersionHistory={state.aiVersionHistory}
                brandResearch={brandResearch}
                influencerStrategy={influencerStrategy}
                onPushVersion={(key: string, data: Record<string, unknown>, source: 'ai' | 'research' | 'manual') =>
                  dispatch({ type: 'PUSH_AI_VERSION', key, data, source })
                }
                onNavigateVersion={(key: string, direction: 'prev' | 'next') =>
                  dispatch({ type: 'NAVIGATE_AI_VERSION', key, direction })
                }
              />
            )}
          </div>
        </div>
      </main>

      {/* Bottom navigation */}
      <WizardNavigation
        currentStep={state.currentStep}
        isFirstStep={isFirstStep}
        isLastStep={isLastStep}
        isRequired={currentStepMeta.required}
        isGenerating={isGenerating}
        onBack={handleBack}
        onSkip={handleSkip}
        onContinue={handleContinue}
        onGenerate={handleGenerate}
      />
    </div>
  )
}
