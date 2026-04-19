'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FormWithDetails } from '@/lib/inner-meeting/types'
import { getForms, subscribeToFormsList, unsubscribe } from '@/lib/inner-meeting/formService'

interface UseFormsListResult {
  forms: FormWithDetails[]
  isLoading: boolean
  refresh: () => Promise<void>
}

export function useFormsList(status?: 'draft' | 'completed'): UseFormsListResult {
  const [forms, setForms] = useState<FormWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadForms = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await getForms(status)
      setForms(data)
    } catch (error) {
      console.error('Error loading forms:', error)
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    loadForms()
    const channel = subscribeToFormsList(() => loadForms())
    return () => unsubscribe(channel)
  }, [loadForms])

  return { forms, isLoading, refresh: loadForms }
}
