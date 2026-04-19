/**
 * Typography Scale — maps abstract scale tokens to concrete sizes
 *
 * Scale is relative to the design system's headingSize.
 * md = ×1.2, lg = ×1.8, xl = ×2.5, xxl = ×3.5
 */

import type { FontWeight } from '@/types/presentation'
import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type { TitleScale, TypoScale } from '../types'

const SCALE_RATIOS: Record<TitleScale, number> = {
  md: 1.2,
  lg: 1.8,
  xl: 2.5,
  xxl: 3.5,
}

export function getTypoScale(scale: TitleScale, ds: PremiumDesignSystem): TypoScale {
  const ratio = SCALE_RATIOS[scale]
  const headingWeight = (ds.typography.weightPairs?.[0]?.[0] ?? 800) as FontWeight
  const bodyWeight = (ds.typography.weightPairs?.[0]?.[1] ?? 400) as FontWeight

  const titleSize = Math.round(ds.typography.headingSize * ratio)
  const titleLineHeight = ds.typography.lineHeightTight || 1.05

  return {
    titleSize,
    titleWeight: headingWeight,
    titleLineHeight,
    subtitleSize: ds.typography.subheadingSize || 32,
    subtitleWeight: bodyWeight,
    bodySize: ds.typography.bodySize || 22,
    bodyWeight: bodyWeight,
    captionSize: ds.typography.captionSize || 15,
    captionWeight: 400 as FontWeight,
    metricSize: Math.round(titleSize * 1.2),
    metricWeight: 900 as FontWeight,
    titleLineHeightPx: Math.round(titleSize * titleLineHeight),
  }
}

/**
 * Estimate pixel height for a text block.
 * Hebrew text in Heebo is wider than Latin — uses 0.62 avg width.
 * Word-aware: breaks at spaces, not mid-word.
 * Adds 15% safety buffer for rendering differences.
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  availableWidth: number,
): number {
  if (!text || availableWidth <= 0) return fontSize * lineHeight

  const avgCharWidth = fontSize * 0.62
  const maxCharsPerLine = Math.max(1, Math.floor(availableWidth / avgCharWidth))

  // Word-aware line counting
  const words = text.split(/\s+/)
  let lines = 1
  let currentLineChars = 0

  for (const word of words) {
    const wordLen = word.length + (currentLineChars > 0 ? 1 : 0)
    if (currentLineChars + wordLen > maxCharsPerLine && currentLineChars > 0) {
      lines++
      currentLineChars = word.length
    } else {
      currentLineChars += wordLen
    }
  }

  // 15% safety buffer
  return Math.round(lines * fontSize * lineHeight * 1.15)
}

/**
 * Check if title text at given scale will overflow.
 * Returns downscaled TitleScale if needed.
 */
export function getAdaptiveTitleScale(
  text: string,
  scale: TitleScale,
  ds: PremiumDesignSystem,
  availableWidth: number,
  availableHeight: number,
): TitleScale {
  const SCALE_ORDER: TitleScale[] = ['xxl', 'xl', 'lg', 'md']
  const startIdx = SCALE_ORDER.indexOf(scale)

  for (let i = startIdx; i < SCALE_ORDER.length; i++) {
    const candidate = SCALE_ORDER[i]
    const typo = getTypoScale(candidate, ds)
    const titleH = estimateTextHeight(text, typo.titleSize, typo.titleLineHeight, availableWidth)

    // Title should use max 40% of available height
    if (titleH <= availableHeight * 0.4) {
      return candidate
    }
  }

  return 'md'
}
