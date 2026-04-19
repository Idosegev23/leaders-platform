'use client'

import { useState, useEffect, useCallback } from 'react'
import { getFormActivityLogs } from '@/lib/inner-meeting/formService'
import type { FormActivityLog as ActivityLog } from '@/lib/inner-meeting/types'

interface Props {
  formId: string | null
}

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

const actionLabel = (a: string) =>
  a === 'save_draft' ? 'שמר טיוטה' : a === 'submit' ? 'שלח טופס' : a

export default function FormActivityLog({ formId }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const loadLogs = useCallback(async () => {
    if (!formId) return
    setIsLoading(true)
    setLogs(await getFormActivityLogs(formId))
    setIsLoading(false)
  }, [formId])

  useEffect(() => {
    if (formId && isExpanded) loadLogs()
  }, [formId, isExpanded, loadLogs])

  if (!formId) return null

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        היסטוריית פעולות
      </button>

      {isExpanded && (
        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mx-auto" />
            </div>
          ) : logs.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">אין היסטוריה עדיין</div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-4 py-3 flex items-center gap-3 bg-gray-50/50 hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {log.user_name || log.user_email}
                    </div>
                    <div className="text-xs text-gray-500">{actionLabel(log.action_type)}</div>
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
