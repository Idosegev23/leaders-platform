'use client'

import React, { useState } from 'react'
import type { SlideElement, ShapeType, DesignSystem } from '@/types/presentation'

interface EditorToolbarProps {
  onAddText: () => void
  onAddShape: (shapeType: ShapeType) => void
  onAddImage: () => void
  onDuplicate: () => void
  onDelete: () => void
  selectedElement: SlideElement | null
  gridVisible?: boolean
  onToggleGrid?: () => void
  snapToGrid?: boolean
  onToggleSnap?: () => void
}

export default function EditorToolbar({
  onAddText,
  onAddShape,
  onAddImage,
  onDuplicate,
  onDelete,
  selectedElement,
  gridVisible,
  onToggleGrid,
  snapToGrid,
  onToggleSnap,
}: EditorToolbarProps) {
  const [showShapeMenu, setShowShapeMenu] = useState(false)

  return (
    <div
      className="flex-shrink-0 bg-[#0f0f18]/80 backdrop-blur-sm border-b border-white/5 px-4 py-1.5"
      dir="rtl"
    >
      <div className="flex items-center gap-1">
        {/* Add Text */}
        <ToolbarButton
          onClick={onAddText}
          title="הוסף טקסט"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          }
          label="טקסט"
        />

        {/* Add Shape (dropdown) */}
        <div className="relative">
          <ToolbarButton
            onClick={() => setShowShapeMenu(prev => !prev)}
            title="הוסף צורה"
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
            }
            label="צורה"
            hasDropdown
          />
          {showShapeMenu && (
            <div className="absolute top-full right-0 mt-1 bg-[#1a1a2e] border border-white/10 rounded-lg shadow-xl z-50 py-1 min-w-[120px]">
              <button
                onClick={() => { onAddShape('rectangle'); setShowShapeMenu(false) }}
                className="w-full px-3 py-1.5 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                מלבן
              </button>
              <button
                onClick={() => { onAddShape('circle'); setShowShapeMenu(false) }}
                className="w-full px-3 py-1.5 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                </svg>
                עיגול
              </button>
              <button
                onClick={() => { onAddShape('line'); setShowShapeMenu(false) }}
                className="w-full px-3 py-1.5 text-right text-xs text-gray-300 hover:bg-white/10 hover:text-white flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                קו
              </button>
            </div>
          )}
        </div>

        {/* Add Image */}
        <ToolbarButton
          onClick={onAddImage}
          title="הוסף תמונה"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          }
          label="תמונה"
        />

        {/* Separator */}
        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Duplicate */}
        <ToolbarButton
          onClick={onDuplicate}
          disabled={!selectedElement}
          title="שכפל (Ctrl+D)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="שכפל"
        />

        {/* Delete */}
        <ToolbarButton
          onClick={onDelete}
          disabled={!selectedElement}
          title="מחק (Delete)"
          icon={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          }
          label="מחק"
          variant="danger"
        />

        {onToggleGrid && (
          <>
            {/* Separator */}
            <div className="w-px h-5 bg-white/10 mx-1" />

            {/* Grid toggle */}
            <ToolbarButton
              onClick={onToggleGrid}
              title="הצג/הסתר רשת (G)"
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
              }
              label="רשת"
              active={gridVisible}
            />

            {/* Snap toggle */}
            {onToggleSnap && (
              <ToolbarButton
                onClick={onToggleSnap}
                title="הצמד לרשת"
                icon={
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                }
                label="הצמד"
                active={snapToGrid}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Toolbar Button ──────────────────────────────────

function ToolbarButton({
  onClick,
  disabled,
  title,
  icon,
  label,
  variant,
  hasDropdown,
  active,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  icon: React.ReactNode
  label: string
  variant?: 'danger'
  hasDropdown?: boolean
  active?: boolean
}) {
  const baseClasses = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors'
  const activeClasses = 'text-blue-400 bg-blue-500/15 ring-1 ring-blue-500/30'
  const enabledClasses = variant === 'danger'
    ? 'text-red-400/70 hover:text-red-300 hover:bg-red-500/10'
    : 'text-gray-400 hover:text-white hover:bg-white/10'
  const disabledClasses = 'opacity-25 cursor-not-allowed'

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${disabled ? disabledClasses : active ? activeClasses : enabledClasses}`}
    >
      {icon}
      <span>{label}</span>
      {hasDropdown && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      )}
    </button>
  )
}
