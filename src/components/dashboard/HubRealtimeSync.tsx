'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to INSERT/UPDATE events on all tables that feed the hub,
 * then router.refresh() — which re-runs the dashboard server component
 * and produces a fresh `fetchHubFeed()` result. Debounced so bursts of
 * changes (e.g. save_draft spam) don't hammer the server.
 */
export function HubRealtimeSync() {
  const router = useRouter()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const supabase = createClient()

    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => router.refresh(), 800)
    }

    const channel = supabase
      .channel('leaders-hub-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' },              scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'document_links' },     scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'forms' },              scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inner_meeting_forms' },scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'form_activity_logs' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' },          scheduleRefresh)
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
