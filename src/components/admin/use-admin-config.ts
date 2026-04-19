'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ConfigCategory } from '@/lib/config/admin-config'

export interface MergedConfigItem {
  key: string
  description: string
  value_type: string
  value: unknown
  defaultValue: unknown
  isOverridden: boolean
  dbId: string | null
  updatedAt: string | null
  group: string | null
}

export function useAdminConfig(category: ConfigCategory) {
  const [configs, setConfigs] = useState<MergedConfigItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || ''

      const res = await fetch(`/api/admin/config?category=${category}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) throw new Error('Failed to fetch configs')
      const data = await res.json()
      setConfigs(data.configs || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הגדרות')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  const saveConfig = useCallback(async (key: string, value: unknown) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''

    const res = await fetch('/api/admin/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ category, key, value }),
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Save failed')
    }

    // Update local state
    setConfigs(prev => prev.map(c =>
      c.key === key ? { ...c, value, isOverridden: true, updatedAt: new Date().toISOString() } : c
    ))

    setSaveMessage('נשמר בהצלחה')
    setTimeout(() => setSaveMessage(null), 2000)
  }, [category])

  const restoreDefault = useCallback(async (key: string) => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token || ''

    const res = await fetch(`/api/admin/config?category=${category}&key=${key}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) throw new Error('Restore failed')

    // Update local state
    setConfigs(prev => prev.map(c =>
      c.key === key ? { ...c, value: c.defaultValue, isOverridden: false, dbId: null, updatedAt: null } : c
    ))

    setSaveMessage('שוחזר לברירת מחדל')
    setTimeout(() => setSaveMessage(null), 2000)
  }, [category])

  return { configs, loading, error, saveMessage, saveConfig, restoreDefault, refetch: fetchConfigs }
}
