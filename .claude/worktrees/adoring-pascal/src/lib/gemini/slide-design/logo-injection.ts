/**
 * Logo injection — Leaders and client brand logos.
 */

import type { Slide, ImageElement } from '@/types/presentation'
import { hexToLuminance } from './color-utils'

function getAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

function extractDominantColor(bg: Slide['background']): string {
  if (bg.type === 'solid') return bg.value
  if (bg.type === 'gradient') {
    const match = bg.value.match(/#[0-9a-fA-F]{3,8}/)
    return match ? match[0] : '#1a1a2e'
  }
  return '#1a1a2e' // image backgrounds assumed dark
}

export function injectLeadersLogo(slides: Slide[]): Slide[] {
  const baseUrl = getAppBaseUrl()
  const whiteLogoUrl = `${baseUrl}/logo.png`
  const blackLogoUrl = `${baseUrl}/logoblack.png`

  return slides.map(slide => {
    const bgColor = extractDominantColor(slide.background)
    const luminance = hexToLuminance(bgColor)
    const isDark = luminance < 0.45
    const logoUrl = isDark ? whiteLogoUrl : blackLogoUrl

    const logoElement: ImageElement = {
      id: `leaders-logo-${slide.id}`,
      type: 'image',
      src: logoUrl,
      alt: 'Leaders',
      x: 40,
      y: 1000,
      width: 140,
      height: 50,
      zIndex: 99,
      objectFit: 'contain',
      opacity: 0.7,
    }

    return {
      ...slide,
      elements: [...slide.elements, logoElement],
    }
  })
}

const CLIENT_LOGO_SLIDES: Record<string, { x: number; y: number; width: number; height: number; opacity: number }> = {
  cover:   { x: 1620, y: 60, width: 220, height: 80, opacity: 0.95 },
  bigIdea: { x: 1660, y: 60, width: 180, height: 65, opacity: 0.85 },
  closing: { x: 810, y: 100, width: 300, height: 110, opacity: 1.0 },
}

export function injectClientLogo(slides: Slide[], clientLogoUrl: string): Slide[] {
  if (!clientLogoUrl) return slides

  return slides.map(slide => {
    const placement = CLIENT_LOGO_SLIDES[slide.slideType]
    if (!placement) return slide

    const logoElement: ImageElement = {
      id: `client-logo-${slide.id}`,
      type: 'image',
      src: clientLogoUrl,
      alt: 'Client Brand',
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zIndex: 95,
      objectFit: 'contain',
      opacity: placement.opacity,
    }

    return {
      ...slide,
      elements: [...slide.elements, logoElement],
    }
  })
}
