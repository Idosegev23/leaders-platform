'use client'

import type { ConfidenceLevel, ConfidenceSource } from '@/types/wizard'

/**
 * ConfidenceIndicator — wraps a wizard field with a colored border
 * indicating the reliability/source of the data.
 *
 * 🟢 HIGH (extracted from brief) — green left border
 * 🟡 MEDIUM (AI-generated / research) — amber left border
 * ⚪ LOW (manual / default) — no special indicator
 * 🔒 DERIVED (calculated) — muted, read-only feel
 */

interface ConfidenceIndicatorProps {
  level?: ConfidenceLevel
  source?: ConfidenceSource
  note?: string
  children: React.ReactNode
  className?: string
}

const BORDER_COLORS: Record<ConfidenceLevel, string> = {
  high: 'border-l-emerald-500',
  medium: 'border-l-amber-500',
  low: '',
  derived: 'border-l-gray-600',
}

const BG_COLORS: Record<ConfidenceLevel, string> = {
  high: 'bg-emerald-500/5',
  medium: 'bg-amber-500/5',
  low: '',
  derived: 'bg-gray-500/5',
}

const SOURCE_LABELS: Record<ConfidenceSource, string> = {
  extracted: 'חולץ מהבריף',
  'ai-generated': 'נוצר ע״י AI',
  research: 'מחקר מותג',
  manual: 'הוזן ידנית',
  calculated: 'מחושב',
}

const LEVEL_ICONS: Record<ConfidenceLevel, string> = {
  high: '✓',
  medium: '◐',
  low: '',
  derived: '⊘',
}

export default function ConfidenceIndicator({
  level,
  source,
  note,
  children,
  className = '',
}: ConfidenceIndicatorProps) {
  // No indicator for unknown or low confidence
  if (!level || level === 'low') {
    return <div className={className}>{children}</div>
  }

  const borderColor = BORDER_COLORS[level]
  const bgColor = BG_COLORS[level]
  const icon = LEVEL_ICONS[level]
  const label = source ? SOURCE_LABELS[source] : note

  return (
    <div className={`relative border-l-[3px] ${borderColor} ${bgColor} rounded-r-lg pl-3 pr-1 py-0.5 ${className}`}>
      {/* Confidence badge */}
      {label && (
        <div className="absolute -top-2 right-2 z-10">
          <span className={`
            text-[9px] font-medium px-1.5 py-0.5 rounded-full
            ${level === 'high' ? 'text-emerald-400 bg-emerald-500/15' : ''}
            ${level === 'medium' ? 'text-amber-400 bg-amber-500/15' : ''}
            ${level === 'derived' ? 'text-gray-500 bg-gray-500/15' : ''}
          `}>
            {icon} {label}
          </span>
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Helper: get confidence for a field from the confidence map
 */
export function getFieldConfidence(
  confidenceMap: Record<string, { level: ConfidenceLevel; source: ConfidenceSource; note?: string }> | undefined,
  stepId: string,
  fieldName: string,
): { level?: ConfidenceLevel; source?: ConfidenceSource; note?: string } {
  if (!confidenceMap) return {}
  const key = `${stepId}.${fieldName}`
  return confidenceMap[key] || {}
}
