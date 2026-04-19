'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface BriefQuotePanelProps {
  title?: string
  briefExcerpt: string
  maxPreviewLength?: number
  onCopyToField?: () => void
  className?: string
}

function DocumentIcon() {
  return (
    <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  )
}

export default function BriefQuotePanel({
  title = 'מהבריף המקורי',
  briefExcerpt,
  maxPreviewLength = 200,
  onCopyToField,
  className,
}: BriefQuotePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const needsTruncation = briefExcerpt.length > maxPreviewLength
  const displayText = needsTruncation && !isExpanded
    ? briefExcerpt.slice(0, maxPreviewLength) + '...'
    : briefExcerpt

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200/80 bg-amber-50/60',
        'border-r-[3px] border-r-amber-400',
        'p-4',
        className,
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <DocumentIcon />
        <span className="text-[13px] font-heebo font-semibold text-amber-800">
          {title}
        </span>
      </div>

      {/* Content */}
      <div className="text-sm leading-relaxed text-amber-900/80 whitespace-pre-wrap">
        {displayText}
      </div>

      {/* Actions row */}
      <div className="mt-3 flex items-center gap-3">
        {needsTruncation && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors underline-offset-2 hover:underline"
          >
            {isExpanded ? 'הצג פחות' : 'קרא עוד...'}
          </button>
        )}
        {onCopyToField && (
          <button
            onClick={onCopyToField}
            className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            <CopyIcon />
            <span>העתק לשדה</span>
          </button>
        )}
      </div>
    </div>
  )
}
