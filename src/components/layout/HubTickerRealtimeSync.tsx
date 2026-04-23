'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Refreshes the server-rendered ticker whenever a new activity_log row
 * appears. Subscribes only to activity_log — the other tables already
 * flow through HubRealtimeSync on the dashboard.
 */
export function HubTickerRealtimeSync() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => router.refresh(), 600)
    }

    const channel = supabase
      .channel('leaders-ticker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, scheduleRefresh)
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
