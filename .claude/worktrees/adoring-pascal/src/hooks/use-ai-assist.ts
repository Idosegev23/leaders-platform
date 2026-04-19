'use client'

import { useState, useCallback, useRef } from 'react'

interface UseAiAssistOptions {
  action: string
  onSuccess?: (data: Record<string, unknown>) => void
}

export function useAiAssist({ action, onSuccess }: UseAiAssistOptions) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const execute = useCallback(async (params: Record<string, unknown>) => {
    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'AI assist request failed')
      }

      const data = await res.json()
      onSuccess?.(data)
      return data
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return null // Silently ignore aborted requests
      }
      const msg = err instanceof Error ? err.message : 'Error'
      setError(msg)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [action, onSuccess])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setIsLoading(false)
  }, [])

  return { execute, isLoading, error, cancel }
}
