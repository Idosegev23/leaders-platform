'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { InnerMeetingForm, Form } from '@/lib/inner-meeting/types'
import { getFormByToken, subscribeToForm, unsubscribe } from '@/lib/inner-meeting/formService'

interface UseRealtimeFormResult {
  form: Form | null
  innerForm: InnerMeetingForm | null
  isLoading: boolean
  updateField: (field: string, value: unknown) => Promise<void>
  initializeForm: (token?: string) => Promise<void>
}

export function useRealtimeForm(): UseRealtimeFormResult {
  const [form, setForm] = useState<Form | null>(null)
  const [innerForm, setInnerForm] = useState<InnerMeetingForm | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const channelRef = useRef<ReturnType<typeof subscribeToForm> | null>(null)

  const initializeForm = useCallback(async (token?: string) => {
    setIsLoading(true)
    try {
      if (token) {
        const formData = await getFormByToken(token)
        if (formData && formData.inner_meeting_form) {
          setForm(formData)
          setInnerForm(formData.inner_meeting_form)

          if (channelRef.current) unsubscribe(channelRef.current)
          channelRef.current = subscribeToForm(formData.id, (payload: unknown) => {
            const p = payload as { eventType?: string; new?: Partial<InnerMeetingForm> }
            if (p.eventType === 'UPDATE' && p.new) {
              setInnerForm((prev) => ({ ...(prev as InnerMeetingForm), ...p.new! }))
            }
          })
        }
      }
    } catch (error) {
      console.error('Error initializing form:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateField = useCallback(
    async (field: string, value: unknown) => {
      if (!innerForm) return
      setInnerForm((prev) => ({ ...(prev as InnerMeetingForm), [field]: value }))
    },
    [innerForm],
  )

  useEffect(() => {
    return () => {
      if (channelRef.current) unsubscribe(channelRef.current)
    }
  }, [])

  return { form, innerForm, isLoading, updateField, initializeForm }
}
