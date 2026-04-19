/**
 * Color Utilities — map emphasis tokens to design system colors
 */

import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'
import type { SlideBackground } from '@/types/presentation'
import type { ColorEmphasis, BackgroundStyle } from '../types'

// ─── Background Builders ────────────────────────────────

export function buildBackground(
  bgStyle: BackgroundStyle,
  emphasis: ColorEmphasis,
  ds: PremiumDesignSystem,
  gradientAngle?: number,
  imageUrl?: string,
): SlideBackground {
  switch (bgStyle) {
    case 'solid':
      return { type: 'solid', value: getBgColor(emphasis, ds) }

    case 'gradient': {
      const angle = gradientAngle || 135
      const { start, end } = getGradientColors(emphasis, ds)
      return { type: 'gradient', value: `linear-gradient(${angle}deg, ${start}, ${end})` }
    }

    case 'aurora':
      return {
        type: 'gradient',
        value: ds.effects.auroraGradient || `radial-gradient(ellipse at 20% 50%, ${ds.colors.auroraA || ds.colors.primary}40, transparent 50%), radial-gradient(ellipse at 80% 20%, ${ds.colors.auroraB || ds.colors.accent}30, transparent 50%), radial-gradient(ellipse at 50% 80%, ${ds.colors.auroraC || ds.colors.secondary}20, transparent 50%), ${ds.colors.background}`,
      }

    case 'image-overlay':
      if (imageUrl) {
        return { type: 'image', value: imageUrl }
      }
      // Fallback to gradient if no image
      return buildBackground('gradient', emphasis, ds, gradientAngle)
  }
}

function getBgColor(emphasis: ColorEmphasis, ds: PremiumDesignSystem): string {
  switch (emphasis) {
    case 'dark': return ds.colors.background
    case 'light': return ds.colors.cardBg
    case 'primary': return ds.colors.primary
    case 'accent': return ds.colors.accent
  }
}

function getGradientColors(emphasis: ColorEmphasis, ds: PremiumDesignSystem): { start: string; end: string } {
  switch (emphasis) {
    case 'dark':
      return { start: ds.colors.background, end: ds.colors.gradientEnd || ds.colors.secondary }
    case 'light':
      return { start: ds.colors.cardBg, end: ds.colors.background }
    case 'primary':
      return { start: ds.colors.gradientStart || ds.colors.primary, end: ds.colors.gradientEnd || ds.colors.secondary }
    case 'accent':
      return { start: ds.colors.accent, end: ds.colors.gradientEnd || ds.colors.primary }
  }
}

// ─── Element Color Helpers ──────────────────────────────

export function textColor(ds: PremiumDesignSystem): string {
  return ds.colors.text
}

export function mutedColor(ds: PremiumDesignSystem): string {
  return ds.colors.muted || `${ds.colors.text}80`
}

export function accentColor(ds: PremiumDesignSystem): string {
  return ds.colors.accent
}

export function cardBgColor(ds: PremiumDesignSystem): string {
  return ds.colors.cardBg
}

export function cardBorderColor(ds: PremiumDesignSystem): string {
  return ds.colors.cardBorder || `${ds.colors.text}15`
}

/** Add transparency to a hex color: withAlpha('#FF0000', 0.3) → '#FF000040' (approx) */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0')
  const base = hex.length === 9 ? hex.slice(0, 7) : hex.length === 7 ? hex : hex
  return `${base}${a}`
}

// ─── Contrast Validation ────────────────────────────────

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '').slice(0, 6)
  if (clean.length < 6) return 0.2
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** Ensure text has WCAG AA contrast (4.5:1) against background. Returns original or fallback. */
export function ensureContrast(
  textHex: string,
  bgHex: string,
  fallbackLight: string = '#FFFFFF',
  fallbackDark: string = '#1A1A1A',
): string {
  const textLum = relativeLuminance(textHex)
  const bgLum = relativeLuminance(bgHex)
  const ratio = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05)

  if (ratio >= 4.5) return textHex

  const lightRatio = (Math.max(relativeLuminance(fallbackLight), bgLum) + 0.05) / (Math.min(relativeLuminance(fallbackLight), bgLum) + 0.05)
  const darkRatio = (Math.max(relativeLuminance(fallbackDark), bgLum) + 0.05) / (Math.min(relativeLuminance(fallbackDark), bgLum) + 0.05)
  return lightRatio > darkRatio ? fallbackLight : fallbackDark
}
