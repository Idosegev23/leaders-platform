'use client'

import React from 'react'
import type { TextElement, FontWeight, DesignSystem } from '@/types/presentation'

interface TextFormatBarProps {
  element: TextElement
  designSystem: DesignSystem
  scale: number
  onChange: (changes: Partial<TextElement>) => void
}

export default function TextFormatBar({
  element,
  designSystem,
  scale,
  onChange,
}: TextFormatBarProps) {
  // Position above the element
  const barY = element.y * scale - 44
  const barX = element.x * scale + (element.width * scale) / 2

  return (
    <div
      style={{
        position: 'absolute',
        left: barX,
        top: Math.max(4, barY),
        transform: 'translateX(-50%)',
        zIndex: 10000,
      }}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1 bg-[#1a1a2e]/95 backdrop-blur-md border border-white/15 rounded-lg shadow-2xl">
        {/* Font weight */}
        <FormatBtn
          active={element.fontWeight >= 700}
          onClick={() => onChange({ fontWeight: element.fontWeight >= 700 ? 400 : 700 as FontWeight })}
          title="Bold"
        >
          <span className="font-bold text-[11px]">B</span>
        </FormatBtn>

        {/* Font size controls */}
        <div className="flex items-center gap-0 border-r border-l border-white/10 mx-0.5 px-1">
          <button
            onClick={() => onChange({ fontSize: Math.max(8, element.fontSize - 2) })}
            className="p-0.5 text-gray-400 hover:text-white transition-colors"
            title="הקטן גופן"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <span className="text-white/70 text-[10px] font-mono min-w-[24px] text-center">{element.fontSize}</span>
          <button
            onClick={() => onChange({ fontSize: Math.min(200, element.fontSize + 2) })}
            className="p-0.5 text-gray-400 hover:text-white transition-colors"
            title="הגדל גופן"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </div>

        {/* Quick colors from design system */}
        {[designSystem.colors.text, designSystem.colors.primary, designSystem.colors.secondary, designSystem.colors.accent].map((color, i) => (
          <button
            key={i}
            onClick={() => onChange({ color })}
            className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
              element.color === color ? 'border-white ring-1 ring-white/50 scale-110' : 'border-white/20'
            }`}
            style={{ background: color }}
            title={color}
          />
        ))}

        <div className="w-px h-4 bg-white/10 mx-0.5" />

        {/* Text alignment */}
        {(['right', 'center', 'left'] as const).map((align) => (
          <FormatBtn
            key={align}
            active={element.textAlign === align}
            onClick={() => onChange({ textAlign: align })}
            title={align === 'right' ? 'ימין' : align === 'center' ? 'מרכז' : 'שמאל'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {align === 'right' ? (
                <><line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></>
              ) : align === 'center' ? (
                <><line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></>
              ) : (
                <><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="16" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></>
              )}
            </svg>
          </FormatBtn>
        ))}
      </div>
    </div>
  )
}

function FormatBtn({ active, onClick, title, children }: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-white/20 text-white'
          : 'text-gray-400 hover:text-white hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}
