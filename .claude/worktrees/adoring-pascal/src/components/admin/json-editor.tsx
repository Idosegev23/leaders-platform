'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'

interface JsonEditorProps {
  configKey: string
  description: string
  value: unknown
  defaultValue: unknown
  isOverridden: boolean
  updatedAt: string | null
  onSave: (key: string, value: unknown) => Promise<void>
  onRestore: (key: string) => Promise<void>
}

export default function JsonEditor({
  configKey,
  description,
  value,
  defaultValue,
  isOverridden,
  updatedAt,
  onSave,
  onRestore,
}: JsonEditorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [editText, setEditText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const originalText = JSON.stringify(value, null, 2)
  const hasChanges = editText !== originalText

  useEffect(() => {
    if (isOpen) {
      setEditText(JSON.stringify(value, null, 2))
      setJsonError(null)
    }
  }, [isOpen, value])

  useEffect(() => {
    if (!editText) return
    const timer = setTimeout(() => {
      try {
        JSON.parse(editText)
        setJsonError(null)
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'JSON לא תקין')
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [editText])

  const handleSave = useCallback(async () => {
    if (jsonError) return
    setIsSaving(true)
    try {
      const parsed = JSON.parse(editText)
      await onSave(configKey, parsed)
    } finally {
      setIsSaving(false)
    }
  }, [configKey, editText, jsonError, onSave])

  const handleRestore = useCallback(async () => {
    if (!confirm('לשחזר ברירת מחדל?')) return
    await onRestore(configKey)
    setEditText(JSON.stringify(defaultValue, null, 2))
  }, [configKey, defaultValue, onRestore])

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(editText)
      setEditText(JSON.stringify(parsed, null, 2))
      setJsonError(null)
    } catch {
      // already invalid
    }
  }, [editText])

  const shortKey = configKey.split('.').pop() || configKey

  return (
    <div className="border border-wizard-border rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
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

      {isOpen && (
        <div className="border-t border-wizard-border px-4 py-4 space-y-3">
          {updatedAt && (
            <p className="text-xs text-muted-foreground">
              שונה לאחרונה: {new Date(updatedAt).toLocaleString('he-IL')}
            </p>
          )}

          <textarea
            dir="ltr"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className={`w-full min-h-[250px] max-h-[600px] resize-y rounded-lg border p-3 font-mono text-xs leading-relaxed outline-none ${
              jsonError
                ? 'border-destructive/50 bg-destructive/5 focus:ring-destructive/20'
                : 'border-wizard-border bg-muted/20 focus:ring-accent/20 focus:border-accent/40'
            } focus:ring-2`}
            spellCheck={false}
          />

          {jsonError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <span>⚠️</span> {jsonError}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || !!jsonError || isSaving}
              >
                {isSaving ? 'שומר...' : 'שמור'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                בטל
              </Button>
              <Button variant="outline" size="sm" onClick={handleFormat} className="text-xs">
                Format
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRestore}
              className="text-xs text-muted-foreground"
            >
              שחזור ברירת מחדל
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
