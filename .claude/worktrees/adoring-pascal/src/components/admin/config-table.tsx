'use client'

import { useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface ConfigItem {
  key: string
  description: string
  value_type: string
  value: unknown
  defaultValue: unknown
  isOverridden: boolean
}

interface ConfigTableProps {
  items: ConfigItem[]
  onSave: (key: string, value: unknown) => Promise<void>
  onRestore: (key: string) => Promise<void>
}

export default function ConfigTable({ items, onSave, onRestore }: ConfigTableProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [savingKey, setSavingKey] = useState<string | null>(null)

  const handleStartEdit = useCallback((key: string, currentValue: unknown) => {
    setEditingKey(key)
    setEditValue(String(currentValue))
  }, [])

  const handleSaveNumber = useCallback(async (key: string) => {
    const num = parseFloat(editValue)
    if (isNaN(num)) return
    setSavingKey(key)
    try {
      await onSave(key, num)
      setEditingKey(null)
    } finally {
      setSavingKey(null)
    }
  }, [editValue, onSave])

  const handleToggleBool = useCallback(async (key: string, currentValue: unknown) => {
    setSavingKey(key)
    try {
      await onSave(key, !currentValue)
    } finally {
      setSavingKey(null)
    }
  }, [onSave])

  const handleRestore = useCallback(async (key: string) => {
    setSavingKey(key)
    try {
      await onRestore(key)
    } finally {
      setSavingKey(null)
    }
  }, [onRestore])

  return (
    <div className="border border-wizard-border rounded-xl bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-wizard-border bg-muted/30">
            <th className="text-right text-xs font-heebo font-semibold text-muted-foreground px-4 py-2.5">הגדרה</th>
            <th className="text-right text-xs font-heebo font-semibold text-muted-foreground px-4 py-2.5 w-40">ערך</th>
            <th className="text-right text-xs font-heebo font-semibold text-muted-foreground px-4 py-2.5 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.key} className="border-b border-wizard-border last:border-0 hover:bg-muted/10">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground">{item.description}</span>
                  {item.isOverridden && (
                    <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-full font-medium">
                      מותאם
                    </span>
                  )}
                </div>
                <code className="text-[10px] font-mono text-muted-foreground">{item.key}</code>
              </td>
              <td className="px-4 py-3">
                {item.value_type === 'boolean' ? (
                  <button
                    onClick={() => handleToggleBool(item.key, item.value)}
                    disabled={savingKey === item.key}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      item.value ? 'bg-accent' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        item.value ? 'translate-x-1.5' : 'translate-x-6'
                      }`}
                    />
                  </button>
                ) : item.value_type === 'number' ? (
                  editingKey === item.key ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveNumber(item.key)
                          if (e.key === 'Escape') setEditingKey(null)
                        }}
                        onBlur={() => handleSaveNumber(item.key)}
                        className="h-8 w-24 text-sm"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => handleStartEdit(item.key, item.value)}
                      className="text-sm font-mono text-foreground hover:text-accent transition-colors cursor-pointer"
                    >
                      {String(item.value)}
                    </button>
                  )
                ) : (
                  <span className="text-sm font-mono text-foreground">{String(item.value)}</span>
                )}
              </td>
              <td className="px-4 py-3 text-left">
                {item.isOverridden && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(item.key)}
                    disabled={savingKey === item.key}
                    className="text-xs text-muted-foreground h-7"
                  >
                    שחזר
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
