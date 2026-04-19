'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/spinner'

interface HistoryEntry {
  id: string
  category: string
  key: string
  old_value: unknown
  new_value: unknown
  changed_by: string
  changed_at: string
  change_reason: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  ai_prompts: 'פרומפטים AI',
  ai_models: 'מודלי AI',
  design_system: 'מערכת עיצוב',
  wizard: 'אשף',
  pipeline: 'Pipeline',
  feature_flags: 'Feature Flags',
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token || ''

        const res = await fetch('/api/admin/config/history?limit=50', {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (res.ok) {
          const data = await res.json()
          setHistory(data.history || [])
        }
      } catch {
        // Silent fail
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-heebo font-bold text-foreground">היסטוריית שינויים</h2>
        <p className="text-sm text-muted-foreground">{history.length} שינויים אחרונים</p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-wizard-border p-8 text-center">
          <p className="text-sm text-muted-foreground">אין שינויים עדיין</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry) => (
            <div
              key={entry.id}
              className="border border-wizard-border rounded-xl bg-white overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-right"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                    {CATEGORY_LABELS[entry.category] || entry.category}
                  </span>
                  <code className="text-xs font-mono text-muted-foreground">{entry.key}</code>
                  {entry.change_reason && (
                    <span className="text-xs text-muted-foreground">— {entry.change_reason}</span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(entry.changed_at).toLocaleString('he-IL')}
                </span>
              </button>

              {expandedId === entry.id && (
                <div className="border-t border-wizard-border px-4 py-3 space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">ערך קודם:</p>
                      <pre dir="ltr" className="text-xs bg-destructive/5 rounded-lg p-2 max-h-40 overflow-auto font-mono whitespace-pre-wrap">
                        {typeof entry.old_value === 'string'
                          ? entry.old_value
                          : JSON.stringify(entry.old_value, null, 2)
                        }
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">ערך חדש:</p>
                      <pre dir="ltr" className="text-xs bg-green-50 rounded-lg p-2 max-h-40 overflow-auto font-mono whitespace-pre-wrap">
                        {typeof entry.new_value === 'string'
                          ? entry.new_value
                          : JSON.stringify(entry.new_value, null, 2)
                        }
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
