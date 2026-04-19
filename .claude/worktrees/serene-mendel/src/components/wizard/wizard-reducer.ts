import type { WizardState, WizardAction, WizardStepId } from '@/types/wizard'
import { WIZARD_STEP_ORDER, getNextStep, getPrevStep, getInitialStatuses } from './wizard-constants'

export function getInitialWizardState(): WizardState {
  return {
    documentId: null,
    currentStep: 'brief',
    stepStatuses: getInitialStatuses(),
    stepData: {},
    extractedData: {},
    isDirty: false,
    lastSavedAt: null,
    aiVersionHistory: {},
  }
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'GO_TO_STEP': {
      const targetStatus = state.stepStatuses[action.step]
      // Can go to completed, skipped, or current step
      if (
        targetStatus === 'completed' ||
        targetStatus === 'skipped' ||
        action.step === state.currentStep
      ) {
        return {
          ...state,
          currentStep: action.step,
          stepStatuses: {
            ...state.stepStatuses,
            [action.step]: 'active',
          },
        }
      }
      return state
    }

    case 'NEXT_STEP': {
      const next = getNextStep(state.currentStep)
      if (!next) return state

      // Mark current as completed if it has data
      const currentHasData = !!state.stepData[state.currentStep]
      const currentStatus = currentHasData ? 'completed' : state.stepStatuses[state.currentStep]

      return {
        ...state,
        currentStep: next,
        stepStatuses: {
          ...state.stepStatuses,
          [state.currentStep]: currentStatus === 'active' ? 'completed' : currentStatus,
          [next]: 'active',
        },
        isDirty: true,
      }
    }

    case 'PREV_STEP': {
      const prev = getPrevStep(state.currentStep)
      if (!prev) return state

      return {
        ...state,
        currentStep: prev,
        stepStatuses: {
          ...state.stepStatuses,
          [prev]: 'active',
        },
      }
    }

    case 'SKIP_STEP': {
      const next = getNextStep(state.currentStep)
      if (!next) return state

      return {
        ...state,
        currentStep: next,
        stepStatuses: {
          ...state.stepStatuses,
          [state.currentStep]: 'skipped',
          [next]: 'active',
        },
        isDirty: true,
      }
    }

    case 'UPDATE_STEP_DATA': {
      return {
        ...state,
        stepData: {
          ...state.stepData,
          [action.step]: {
            ...(state.stepData[action.step] || {}),
            ...action.data,
          },
        },
        isDirty: true,
      }
    }

    case 'MARK_STEP_COMPLETE': {
      return {
        ...state,
        stepStatuses: {
          ...state.stepStatuses,
          [action.step]: 'completed',
        },
      }
    }

    case 'LOAD_STATE': {
      return {
        ...action.state,
        isDirty: false,
      }
    }

    case 'MARK_SAVED': {
      return {
        ...state,
        isDirty: false,
        lastSavedAt: action.timestamp,
      }
    }

    case 'SET_DOCUMENT_ID': {
      return {
        ...state,
        documentId: action.id,
      }
    }

    case 'SET_EXTRACTED_DATA': {
      return {
        ...state,
        extractedData: action.data,
      }
    }

    case 'MARK_DIRTY': {
      return {
        ...state,
        isDirty: true,
      }
    }

    case 'PUSH_AI_VERSION': {
      const history = state.aiVersionHistory || {}
      const existing = history[action.key] || { versions: [], currentIndex: -1 }
      // Truncate forward versions if navigated back
      const trimmed = existing.versions.slice(0, existing.currentIndex + 1)
      const newVersions = [
        ...trimmed,
        { data: action.data, timestamp: new Date().toISOString(), source: action.source },
      ].slice(-10) // Cap at 10 versions
      return {
        ...state,
        aiVersionHistory: {
          ...history,
          [action.key]: { versions: newVersions, currentIndex: newVersions.length - 1 },
        },
      }
    }

    case 'NAVIGATE_AI_VERSION': {
      const hist = state.aiVersionHistory?.[action.key]
      if (!hist || hist.versions.length === 0) return state
      const newIndex = action.direction === 'prev'
        ? Math.max(0, hist.currentIndex - 1)
        : Math.min(hist.versions.length - 1, hist.currentIndex + 1)
      if (newIndex === hist.currentIndex) return state

      const versionData = hist.versions[newIndex].data
      // Determine which step this key belongs to and write back
      const stepId = action.key.split('.')[0] as WizardStepId
      return {
        ...state,
        aiVersionHistory: {
          ...state.aiVersionHistory,
          [action.key]: { ...hist, currentIndex: newIndex },
        },
        stepData: {
          ...state.stepData,
          [stepId]: {
            ...(state.stepData[stepId] || {}),
            ...versionData,
          },
        },
        isDirty: true,
      }
    }

    default:
      return state
  }
}

/**
 * Check if a step can be navigated to (for progress bar clicks)
 */
export function canNavigateToStep(state: WizardState, step: WizardStepId): boolean {
  const status = state.stepStatuses[step]
  return status === 'completed' || status === 'skipped' || step === state.currentStep
}

/**
 * Check if the wizard is complete (all required steps done)
 */
export function isWizardComplete(state: WizardState): boolean {
  // Import at usage to avoid circular deps
  const { WIZARD_STEPS } = require('./wizard-constants')
  return WIZARD_STEPS.every(
    (step: { id: WizardStepId; required: boolean }) =>
      !step.required ||
      state.stepStatuses[step.id] === 'completed'
  )
}

/**
 * Get current step index (1-based for display)
 */
export function getCurrentStepNumber(state: WizardState): number {
  return WIZARD_STEP_ORDER.indexOf(state.currentStep) + 1
}
