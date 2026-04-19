'use client'

import { useReducer, useCallback, useRef } from 'react'
import type {
  Presentation,
  Slide,
  SlideElement,
  SlideBackground,
} from '@/types/presentation'

// ─── Action Types ────────────────────────────────────

type EditorAction =
  | { type: 'SELECT_SLIDE'; index: number }
  | { type: 'SELECT_ELEMENT'; elementId: string | null }
  | { type: 'UPDATE_ELEMENT'; slideIndex: number; elementId: string; changes: Partial<SlideElement> }
  | { type: 'ADD_ELEMENT'; slideIndex: number; element: SlideElement }
  | { type: 'DELETE_ELEMENT'; slideIndex: number; elementId: string }
  | { type: 'DUPLICATE_ELEMENT'; slideIndex: number; elementId: string }
  | { type: 'UPDATE_SLIDE_BACKGROUND'; slideIndex: number; background: SlideBackground }
  | { type: 'REPLACE_SLIDE'; slideIndex: number; slide: Slide }
  | { type: 'ADD_SLIDE'; slide: Slide; atIndex?: number }
  | { type: 'DUPLICATE_SLIDE'; slideIndex: number }
  | { type: 'DELETE_SLIDE'; slideIndex: number }
  | { type: 'REORDER_SLIDES'; fromIndex: number; toIndex: number }
  | { type: 'SET_PRESENTATION'; presentation: Presentation }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'MARK_SAVED' }

// ─── State ───────────────────────────────────────────

interface EditorState {
  presentation: Presentation
  selectedSlideIndex: number
  selectedElementId: string | null
  undoStack: Presentation[]
  redoStack: Presentation[]
  isDirty: boolean
}

const MAX_UNDO = 30

// ─── Helpers ─────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function pushUndo(state: EditorState): { undoStack: Presentation[]; redoStack: Presentation[] } {
  return {
    undoStack: [...state.undoStack.slice(-MAX_UNDO + 1), state.presentation],
    redoStack: [],
  }
}

// ─── Reducer ─────────────────────────────────────────

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SELECT_SLIDE':
      return {
        ...state,
        selectedSlideIndex: action.index,
        selectedElementId: null,
      }

    case 'SELECT_ELEMENT':
      return {
        ...state,
        selectedElementId: action.elementId,
      }

    case 'UPDATE_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      const elIndex = slide.elements.findIndex(e => e.id === action.elementId)
      if (elIndex === -1) return state

      slide.elements[elIndex] = { ...slide.elements[elIndex], ...action.changes } as SlideElement

      return {
        ...state,
        presentation: newPresentation,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'ADD_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.elements.push(action.element)

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: action.element.id,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'DELETE_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.elements = slide.elements.filter(e => e.id !== action.elementId)

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: state.selectedElementId === action.elementId ? null : state.selectedElementId,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'DUPLICATE_ELEMENT': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      const srcElement = slide.elements.find(e => e.id === action.elementId)
      if (!srcElement) return state

      const cloned = structuredClone(srcElement)
      cloned.id = generateId('el')
      cloned.x += 20
      cloned.y += 20

      slide.elements.push(cloned)

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: cloned.id,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'UPDATE_SLIDE_BACKGROUND': {
      const newPresentation = structuredClone(state.presentation)
      const slide = newPresentation.slides[action.slideIndex]
      if (!slide) return state

      slide.background = action.background

      return {
        ...state,
        presentation: newPresentation,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'REPLACE_SLIDE': {
      const newPresentation = structuredClone(state.presentation)
      newPresentation.slides[action.slideIndex] = action.slide

      return {
        ...state,
        presentation: newPresentation,
        selectedElementId: null,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'ADD_SLIDE': {
      const newPresentation = structuredClone(state.presentation)
      const insertAt = action.atIndex !== undefined ? action.atIndex : newPresentation.slides.length
      newPresentation.slides.splice(insertAt, 0, action.slide)

      return {
        ...state,
        presentation: newPresentation,
        selectedSlideIndex: insertAt,
        selectedElementId: null,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'DUPLICATE_SLIDE': {
      const newPresentation = structuredClone(state.presentation)
      const srcSlide = newPresentation.slides[action.slideIndex]
      if (!srcSlide) return state

      const clonedSlide = structuredClone(srcSlide)
      clonedSlide.id = generateId('slide')
      // Generate new IDs for all elements
      clonedSlide.elements = clonedSlide.elements.map(el => ({
        ...el,
        id: generateId('el'),
      }))

      const insertAt = action.slideIndex + 1
      newPresentation.slides.splice(insertAt, 0, clonedSlide)

      return {
        ...state,
        presentation: newPresentation,
        selectedSlideIndex: insertAt,
        selectedElementId: null,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'DELETE_SLIDE': {
      if (state.presentation.slides.length <= 1) return state

      const newPresentation = structuredClone(state.presentation)
      newPresentation.slides.splice(action.slideIndex, 1)

      const newIndex = action.slideIndex >= newPresentation.slides.length
        ? newPresentation.slides.length - 1
        : action.slideIndex

      return {
        ...state,
        presentation: newPresentation,
        selectedSlideIndex: newIndex,
        selectedElementId: null,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'REORDER_SLIDES': {
      const newPresentation = structuredClone(state.presentation)
      const [moved] = newPresentation.slides.splice(action.fromIndex, 1)
      newPresentation.slides.splice(action.toIndex, 0, moved)

      return {
        ...state,
        presentation: newPresentation,
        selectedSlideIndex: action.toIndex,
        ...pushUndo(state),
        isDirty: true,
      }
    }

    case 'SET_PRESENTATION':
      return {
        ...state,
        presentation: action.presentation,
        selectedSlideIndex: 0,
        selectedElementId: null,
        undoStack: [],
        redoStack: [],
        isDirty: false,
      }

    case 'UNDO': {
      if (state.undoStack.length === 0) return state
      const prev = state.undoStack[state.undoStack.length - 1]
      return {
        ...state,
        presentation: prev,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, state.presentation],
        isDirty: true,
      }
    }

    case 'REDO': {
      if (state.redoStack.length === 0) return state
      const next = state.redoStack[state.redoStack.length - 1]
      return {
        ...state,
        presentation: next,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, state.presentation],
        isDirty: true,
      }
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false }

    default:
      return state
  }
}

// ─── Hook ────────────────────────────────────────────

export function usePresentationEditor(initialPresentation: Presentation) {
  const [state, dispatch] = useReducer(editorReducer, {
    presentation: initialPresentation,
    selectedSlideIndex: 0,
    selectedElementId: null,
    undoStack: [],
    redoStack: [],
    isDirty: false,
  })

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Computed values
  const selectedSlide = state.presentation.slides[state.selectedSlideIndex] || null
  const selectedElement = selectedSlide?.elements.find(e => e.id === state.selectedElementId) || null

  // ─── Element Actions
  const selectSlide = useCallback((index: number) => {
    dispatch({ type: 'SELECT_SLIDE', index })
  }, [])

  const selectElement = useCallback((elementId: string | null) => {
    dispatch({ type: 'SELECT_ELEMENT', elementId })
  }, [])

  const updateElement = useCallback((elementId: string, changes: Partial<SlideElement>) => {
    dispatch({
      type: 'UPDATE_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      elementId,
      changes,
    })
  }, [state.selectedSlideIndex])

  const addElement = useCallback((element: SlideElement) => {
    dispatch({
      type: 'ADD_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      element,
    })
  }, [state.selectedSlideIndex])

  const deleteElement = useCallback((elementId: string) => {
    dispatch({
      type: 'DELETE_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      elementId,
    })
  }, [state.selectedSlideIndex])

  const duplicateElement = useCallback((elementId: string) => {
    dispatch({
      type: 'DUPLICATE_ELEMENT',
      slideIndex: state.selectedSlideIndex,
      elementId,
    })
  }, [state.selectedSlideIndex])

  // ─── Slide Actions
  const updateSlideBackground = useCallback((background: SlideBackground) => {
    dispatch({
      type: 'UPDATE_SLIDE_BACKGROUND',
      slideIndex: state.selectedSlideIndex,
      background,
    })
  }, [state.selectedSlideIndex])

  const replaceSlide = useCallback((slideIndex: number, slide: Slide) => {
    dispatch({ type: 'REPLACE_SLIDE', slideIndex, slide })
  }, [])

  const addSlide = useCallback((slide: Slide, atIndex?: number) => {
    dispatch({ type: 'ADD_SLIDE', slide, atIndex })
  }, [])

  const duplicateSlide = useCallback((index: number) => {
    dispatch({ type: 'DUPLICATE_SLIDE', slideIndex: index })
  }, [])

  const deleteSlide = useCallback((index: number) => {
    dispatch({ type: 'DELETE_SLIDE', slideIndex: index })
  }, [])

  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_SLIDES', fromIndex, toIndex })
  }, [])

  const setPresentation = useCallback((presentation: Presentation) => {
    dispatch({ type: 'SET_PRESENTATION', presentation })
  }, [])

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), [])
  const redo = useCallback(() => dispatch({ type: 'REDO' }), [])

  // ─── Save (debounced 2s)
  const save = useCallback(async (documentId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)

    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/documents/${documentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ _presentation: state.presentation }),
        })
        dispatch({ type: 'MARK_SAVED' })
        console.log('[PresentationEditor] Saved to Supabase')
      } catch (err) {
        console.error('[PresentationEditor] Save failed:', err)
      }
    }, 2000)
  }, [state.presentation])

  const saveNow = useCallback(async (documentId: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    try {
      await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _presentation: state.presentation }),
      })
      dispatch({ type: 'MARK_SAVED' })
    } catch (err) {
      console.error('[PresentationEditor] Save failed:', err)
    }
  }, [state.presentation])

  return {
    // State
    presentation: state.presentation,
    selectedSlideIndex: state.selectedSlideIndex,
    selectedElementId: state.selectedElementId,
    selectedSlide,
    selectedElement,
    isDirty: state.isDirty,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,

    // Element Actions
    selectSlide,
    selectElement,
    updateElement,
    addElement,
    deleteElement,
    duplicateElement,

    // Slide Actions
    updateSlideBackground,
    replaceSlide,
    addSlide,
    duplicateSlide,
    deleteSlide,
    reorderSlides,
    setPresentation,

    // History
    undo,
    redo,

    // Persistence
    save,
    saveNow,
  }
}
