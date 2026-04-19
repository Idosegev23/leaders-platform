'use client'

import React, { useState } from 'react'

interface ResearchItem {
  label: string
  value: string | string[] | { name?: string; description?: string }[] | undefined | null
}

interface ResearchContextProps {
  title?: string
  items: ResearchItem[]
}

export default function ResearchContext({ title = 'ממצאי מחקר', items }: ResearchContextProps) {
  const [isOpen, setIsOpen] = useState(false)

  // Filter out empty items
  const visibleItems = items.filter(item => {
    if (!item.value) return false
    if (typeof item.value === 'string') return item.value.trim().length > 0
    if (Array.isArray(item.value)) return item.value.length > 0
    return true
  })

  if (visibleItems.length === 0) return null

  return (
    <div className="rounded-2xl border border-indigo-200/60 bg-indigo-50/30 overflow-hidden shadow-wizard-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-indigo-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100/80">
            <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span className="text-sm font-heebo font-bold text-indigo-900/80">{title}</span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-rubik font-medium text-indigo-600">
            {visibleItems.length} ממצאים
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-indigo-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-5 pb-4 space-y-3 border-t border-indigo-100/80">
          <div className="pt-3 space-y-2.5">
            {visibleItems.map((item, idx) => (
              <div key={idx}>
                <span className="text-[11px] font-heebo font-semibold text-indigo-700/70 uppercase tracking-wide">
                  {item.label}
                </span>
                <div className="mt-0.5">
                  {renderValue(item.value)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function renderValue(value: ResearchItem['value']) {
  if (!value) return null

  if (typeof value === 'string') {
    return (
      <p className="text-[13px] text-wizard-text-secondary leading-relaxed">
        {value}
      </p>
    )
  }

  if (Array.isArray(value)) {
    // Array of strings
    if (value.length > 0 && typeof value[0] === 'string') {
      return (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {(value as string[]).map((v, i) => (
            <span
              key={i}
              className="inline-block rounded-lg bg-indigo-100/60 px-2.5 py-1 text-[12px] text-indigo-800/80 font-rubik"
            >
              {v}
            </span>
          ))}
        </div>
      )
    }

    // Array of objects (competitors, etc.)
    if (value.length > 0 && typeof value[0] === 'object') {
      return (
        <div className="space-y-1.5 mt-1">
          {(value as { name?: string; description?: string }[]).map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="text-indigo-400 mt-0.5 shrink-0">•</span>
              <div>
                {item.name && (
                  <span className="font-heebo font-semibold text-wizard-text-primary">{item.name}</span>
                )}
                {item.name && item.description && <span className="text-wizard-text-tertiary"> — </span>}
                {item.description && (
                  <span className="text-wizard-text-secondary">{item.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )
    }
  }

  return null
}
