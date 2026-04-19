'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface InnerMeetingUser {
  email: string
  name: string
  hebrewName: string
  contactId: string
}

interface Result {
  user: InnerMeetingUser | null
  isLoading: boolean
}

/**
 * Resolves the signed-in Supabase user to a row in `contacts` so the
 * inner-meeting form can log activity with the person's Hebrew name and
 * contact id. Returns null if the user isn't authenticated or isn't in the
 * contacts whitelist (the middleware should have caught that upstream, but
 * we handle it defensively here).
 */
export function useInnerMeetingUser(): Result {
  const [user, setUser] = useState<InnerMeetingUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser?.email) {
        if (!cancelled) {
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      const { data: contact } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, hebrew_first_name, hebrew_last_name, email')
        .eq('email', authUser.email.toLowerCase())
        .maybeSingle()

      if (cancelled) return

      if (!contact) {
        // User authenticated but not in the Leaders whitelist — fall back to
        // auth metadata so the form at least logs something recognizable.
        setUser({
          email: authUser.email,
          name: authUser.user_metadata?.full_name ?? authUser.email,
          hebrewName: authUser.user_metadata?.full_name ?? authUser.email,
          contactId: authUser.id,
        })
      } else {
        setUser({
          email: contact.email,
          name: `${contact.first_name} ${contact.last_name}`,
          hebrewName: `${contact.hebrew_first_name} ${contact.hebrew_last_name}`,
          contactId: contact.id,
        })
      }
      setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { user, isLoading }
}
