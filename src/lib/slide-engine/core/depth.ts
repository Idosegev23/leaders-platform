/**
 * Depth & Shadow System — z-index layers + multi-layer shadow presets
 *
 * Layer system (0-10):
 *   0-1: BACKGROUND — fills, gradients, aurora
 *   2-3: DECORATIVE — watermarks, motif patterns, accent shapes
 *   4-5: STRUCTURE — cards, containers, dividers
 *   6-8: CONTENT — body text, bullets, labels
 *   9-10: HERO — main title, key number, brand name
 */

import type { PremiumDesignSystem } from '@/lib/gemini/slide-design/types'

export const Z = {
  BACKGROUND: 0,
  GRADIENT_OVERLAY: 1,
  DECORATIVE: 2,
  MOTIF: 3,
  CARD: 4,
  CONTAINER: 5,
  CONTENT: 6,
  BODY: 6,
  BULLETS: 7,
  SUBTITLE: 8,
  HERO: 9,
  HERO_TOP: 10,
} as const

// ─── Shadow Presets (multi-layer for realism) ───────────

export function getShadow(style: PremiumDesignSystem['effects']['shadowStyle'], intensity: 'light' | 'medium' | 'heavy' = 'medium'): string {
  if (style === 'none') {
    // Even "none" gets subtle elevation
    switch (intensity) {
      case 'light': return '0 2px 8px rgba(0,0,0,0.12)'
      case 'medium': return '0 4px 16px rgba(0,0,0,0.18)'
      case 'heavy': return '0 8px 32px rgba(0,0,0,0.25)'
    }
  }

  if (style === 'fake-3d') {
    switch (intensity) {
      case 'light': return '4px 4px 0px rgba(0,0,0,0.15), 2px 2px 8px rgba(0,0,0,0.1)'
      case 'medium': return '8px 8px 0px rgba(0,0,0,0.2), 4px 4px 16px rgba(0,0,0,0.12)'
      case 'heavy': return '12px 12px 0px rgba(0,0,0,0.25), 6px 6px 24px rgba(0,0,0,0.15), 0 0 60px rgba(0,0,0,0.08)'
    }
  }

  if (style === 'glow') {
    switch (intensity) {
      case 'light': return '0 0 20px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.2)'
      case 'medium': return '0 0 40px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.25)'
      case 'heavy': return '0 0 60px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.3), 0 0 100px rgba(255,255,255,0.05)'
    }
  }

  return '0 4px 16px rgba(0,0,0,0.18)'
}

export function titleShadow(): string {
  return '0 4px 24px rgba(0,0,0,0.5)'
}

export function subtitleShadow(): string {
  return '0 2px 12px rgba(0,0,0,0.3)'
}

export function cardShadow(ds: PremiumDesignSystem): string {
  return getShadow(ds.effects.shadowStyle, 'medium')
}

// ─── Border Radius ──────────────────────────────────────

export function getBorderRadius(ds: PremiumDesignSystem, scale: 'sm' | 'md' | 'lg' = 'md'): number {
  const base = ds.effects.borderRadiusValue || 12
  switch (scale) {
    case 'sm': return Math.round(base * 0.5)
    case 'md': return base
    case 'lg': return Math.round(base * 2)
  }
}
