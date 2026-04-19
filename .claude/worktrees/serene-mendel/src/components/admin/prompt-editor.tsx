'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

interface PromptEditorProps {
  configKey: string
  description: string
  value: string
  defaultValue: string
  isOverridden: boolean
  updatedAt: string | null
  onSave: (key: string, value: string) => Promise<void>
  onRestore: (key: string) => Promise<void>
}

export default function PromptEditor({
  configKey,
  description,
  value,
  defaultValue,
  isOverridden,
  updatedAt,
  onSave,
  onRestore,
}: PromptEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const hasChanges = editValue !== value
  const isDifferentFromDefault = editValue !== (typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue, null, 2))

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      await onSave(configKey, editValue)
    } finally {
      setIsSaving(false)
    }
  }, [configKey, editValue, onSave])

  const handleRestore = useCallback(async () => {
    if (!confirm('לשחזר ברירת מחדל? הערך הנוכחי יידרס.')) return
    setIsRestoring(true)
    try {
      await onRestore(configKey)
      const defaultStr = typeof defaultValue === 'string' ? defaultValue : JSON.stringify(defaultValue, null, 2)
      setEditValue(defaultStr)
    } finally {
      setIsRestoring(false)
    }
  }, [configKey, defaultValue, onRestore])

  const handleToggle = useCallback(() => {
    if (!isOpen) {
      const val = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      setEditValue(val)
    }
    setIsOpen(!isOpen)
  }, [isOpen, value])

  const shortKey = configKey.split('.').pop() || configKey

  return (
    <div className="border border-wizard-border rounded-xl bg-white overflow-hidden">
      {/* Header row */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-right"
      >
        <div className="flex items-center gap-3">
          <code className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {shortKey}
          </code>
          <span className="text-sm font-heebo text-foreground">{description}</span>
          {isOverridden && (
            <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
              מותאם
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Editor (accordion) */}
      {isOpen && (
        <div className="border-t border-wizard-border px-4 py-4 space-y-3">
          {updatedAt && (
            <p className="text-xs text-muted-foreground">
              שונה לאחרונה: {new Date(updatedAt).toLocaleString('he-IL')}
            </p>
          )}

          <textarea
            dir="ltr"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full min-h-[200px] max-h-[500px] resize-y rounded-lg border border-wizard-border bg-muted/20 p-3 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none"
            spellCheck={false}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="gap-1.5"
              >
                {isSaving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    שומר...
                  </>
                ) : 'שמור'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggle}
              >
                בטל
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {isDifferentFromDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="text-xs text-muted-foreground"
                >
                  {isRestoring ? 'משחזר...' : 'שחזור ברירת מחדל'}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                {editValue.length.toLocaleString()} תווים
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
