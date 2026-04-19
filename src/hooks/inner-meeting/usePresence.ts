'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UsePresenceResult {
  activeCount: number
  isConnected: boolean
}

export function usePresence(formId: string | null): UsePresenceResult {
  const [activeCount, setActiveCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const sessionId = useRef(Math.random().toString(36).substring(7))

  useEffect(() => {
    if (!formId) {
      setActiveCount(0)
      setIsConnected(false)
      return
    }

    const supabase = createClient()
    const channel = supabase.channel(`presence:form:${formId}`, {
      config: { presence: { key: sessionId.current } },
    })

    const updateCount = () => {
      const state = channel.presenceState()
      setActiveCount(Object.keys(state).length)
    }

    channel
      .on('presence', { event: 'sync' }, updateCount)
      .on('presence', { event: 'join' }, updateCount)
      .on('presence', { event: 'leave' }, updateCount)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        channelRef.current.untrack()
        supabase.removeChannel(channelRef.current)
      }
      setIsConnected(false)
      setActiveCount(0)
    }
  }, [formId])

  return { activeCount, isConnected }
}
