'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { extractEditableFields, applyEdits, type SlideEditableField } from '@/lib/utils/slide-html-parser'
import { getSlideLabel } from '@/lib/slides/slide-type-config'

interface SlideEditorPanelProps {
  slideIndex: number
  slideHtml: string
  onSave: (updatedHtml: string) => void
  onClose: () => void
  onPreview?: (previewHtml: string) => void
}

export default function SlideEditorPanel({
  slideIndex,
  slideHtml,
  onSave,
  onClose,
  onPreview,
}: SlideEditorPanelProps) {
  const [fields, setFields] = useState<SlideEditableField[]>([])
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Extract fields when slide changes
  useEffect(() => {
    const extracted = extractEditableFields(slideHtml)
    setFields(extracted)
    // Init edit values with current values
    const initial: Record<string, string> = {}
    extracted.forEach(f => { initial[f.id] = f.currentValue })
    setEditValues(initial)
    setHasChanges(false)
  }, [slideHtml, slideIndex])

  // Live preview with debounce
  const triggerPreview = useCallback((values: Record<string, string>) => {
    if (!onPreview) return
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      // Only apply changed values
      const changes: Record<string, string> = {}
      fields.forEach(f => {
        if (values[f.id] !== f.currentValue) {
          changes[f.id] = values[f.id]
        }
      })
      if (Object.keys(changes).length > 0) {
        const preview = applyEdits(slideHtml, changes)
        onPreview(preview)
      }
    }, 500)
  }, [fields, slideHtml, onPreview])

  const handleFieldChange = (fieldId: string, value: string) => {
    const newValues = { ...editValues, [fieldId]: value }
    setEditValues(newValues)
    setHasChanges(true)
    triggerPreview(newValues)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const changes: Record<string, string> = {}
      fields.forEach(f => {
        if (editValues[f.id] !== f.currentValue) {
          changes[f.id] = editValues[f.id]
        }
      })
      const updated = applyEdits(slideHtml, changes)
      onSave(updated)
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    const initial: Record<string, string> = {}
    fields.forEach(f => { initial[f.id] = f.currentValue })
    setEditValues(initial)
    setHasChanges(false)
    if (onPreview) onPreview(slideHtml) // Reset preview
  }

  // Group fields by type
  const textFields = fields.filter(f => f.type === 'text')
  const imageFields = fields.filter(f => f.type === 'image')

  return (
    <div
      className="w-[380px] flex-shrink-0 bg-[#0f0f18] border-l border-white/5 flex flex-col h-full"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex-shrink-0 border-b border-white/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-sm font-medium">
              עריכת שקף {slideIndex + 1}
            </h2>
            <p className="text-gray-500 text-xs mt-0.5">
              {getSlideLabel(slideIndex)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable field list */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}
      >
        {fields.length === 0 && (
          <p className="text-gray-500 text-xs text-center py-8">
            לא נמצאו שדות לעריכה בשקף זה
          </p>
        )}

        {/* Text fields */}
        {textFields.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-gray-400 text-[11px] font-medium uppercase tracking-wider">
              טקסטים
            </h3>
            {textFields.map(field => (
              <div key={field.id}>
                <label className="text-gray-400 text-xs mb-1 block">
                  {field.label}
                  <span className="text-gray-600 mr-1 text-[10px]">({field.tag})</span>
                </label>
                {/* Headings get single-line input, body text gets textarea */}
                {['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(field.tag) ? (
                  <input
                    type="text"
                    value={editValues[field.id] || ''}
                    onChange={e => handleFieldChange(field.id, e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors"
                    dir="rtl"
                  />
                ) : (
                  <textarea
                    value={editValues[field.id] || ''}
                    onChange={e => handleFieldChange(field.id, e.target.value)}
                    rows={Math.min(Math.max(2, Math.ceil((editValues[field.id]?.length || 0) / 40)), 6)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors resize-none"
                    dir="rtl"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Image fields */}
        {imageFields.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-gray-400 text-[11px] font-medium uppercase tracking-wider">
              תמונות
            </h3>
            {imageFields.map(field => (
              <div key={field.id}>
                <label className="text-gray-400 text-xs mb-1 block">
                  {field.label}
                </label>
                {/* Thumbnail preview */}
                {editValues[field.id] && (
                  <div className="mb-1.5 rounded-lg overflow-hidden bg-black/30 border border-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editValues[field.id]}
                      alt={field.label}
                      className="w-full h-20 object-cover"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>
                )}
                <input
                  type="text"
                  value={editValues[field.id] || ''}
                  onChange={e => handleFieldChange(field.id, e.target.value)}
                  placeholder="URL של תמונה..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-colors font-mono"
                  dir="ltr"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 border-t border-white/5 px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex-1 px-4 py-2 text-sm font-medium text-black bg-white rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isSaving ? 'שומר...' : 'שמור שינויים'}
          </button>
          <button
            onClick={handleReset}
            disabled={!hasChanges}
            className="px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            איפוס
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-400 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
