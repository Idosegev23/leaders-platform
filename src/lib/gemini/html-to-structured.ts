/**
 * Faithful converter: agent deck (generate-full's 11 slides) → StructuredPresentation.
 *
 * Fixes the "two brains" flow bug: /edit used to REGENERATE a new deck from the
 * brief when no structured presentation existed, so the editor (and the Canva
 * export behind it) showed a different deck than the one the user generated.
 * This converter derives the structured deck 1:1 from the agent's slides —
 * same order, same copy (verbatim), same images — no model call involved.
 */

import type {
  StructuredPresentation,
  StructuredSlide,
  DesignSystem,
} from '@/lib/gemini/layout-prototypes/types'

export interface AgentSlideContent {
  slideType: string
  title: string
  content?: Record<string, unknown>
}

interface EnrichedInfluencer {
  name?: string
  username?: string
  profilePicUrl?: string
  followers?: number
  engagementRate?: number
  isVerified?: boolean
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function cards(v: unknown): Array<{ title: string; body: string }> {
  if (!Array.isArray(v)) return []
  return v
    .map(c => ({ title: str((c as Record<string, unknown>)?.title), body: str((c as Record<string, unknown>)?.body) }))
    .filter(c => c.title)
}

function bullets(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : []
}

function fmtFollowers(n?: number): string {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function toDesignSystem(ds: Record<string, unknown> | undefined): DesignSystem {
  const colors = ((ds?.colors ?? {}) as Record<string, string>)
  const fonts = ((ds?.fonts ?? {}) as Record<string, string>)
  const background = colors.background || '#0C0C10'
  const text = colors.text || '#F5F5F7'
  return {
    colors: {
      primary: colors.primary || '#E94560',
      secondary: colors.secondary || colors.primary || '#0F3460',
      accent: colors.accent || colors.primary || '#E94560',
      background,
      text,
      muted: colors.muted || `${text}99`.slice(0, 7) === text ? '#8B8D98' : (colors.muted || '#8B8D98'),
      cardBg: colors.cardBg || 'rgba(255,255,255,0.05)',
    },
    fonts: {
      heading: fonts.heading || 'Heebo',
      body: fonts.body || 'Heebo',
    },
  }
}

/**
 * Convert the agent's slides to structured slides, preserving order and copy.
 * `enhancedInfluencers` (wizard/IMAI-enriched, optional) upgrades the
 * influencer slide with real handles/photos when available.
 */
export function agentSlidesToStructured(args: {
  slides: AgentSlideContent[]
  designSystem?: Record<string, unknown>
  brandName: string
  brandLogoUrl?: string
  enhancedInfluencers?: EnrichedInfluencer[]
}): StructuredPresentation {
  const { slides, brandName } = args
  const out: StructuredSlide[] = []
  let imageSide: 'left' | 'right' = 'left'

  slides.forEach((s, i) => {
    const c = s.content ?? {}
    const title = str(c.title) || s.title || ''
    const subtitle = str(c.subtitle)
    const body = str(c.bodyText)
    const image = str(c.imageUrl)
    const keyNumber = str(c.keyNumber)
    const keyLabel = str(c.keyNumberLabel)
    const cardList = cards(c.cards)
    const bulletList = bullets(c.bulletPoints)
    const eyebrow = `${s.slideType.toUpperCase()} // ${String(i + 1).padStart(2, '0')}`

    const push = (slide: StructuredSlide) => out.push({ ...slide, slideNumber: i + 1 })

    switch (s.slideType) {
      case 'cover':
        push({
          slideType: s.slideType,
          layout: 'hero-cover',
          slots: { brandName, title, subtitle: subtitle || body || undefined, backgroundImage: image || undefined, eyebrowLabel: 'INITIATION' },
        })
        return
      case 'closing':
        push({
          slideType: s.slideType,
          layout: 'closing-cta',
          slots: { brandName, title: title || 'בואו נתחיל', tagline: `${brandName} × LEADERS`, backgroundImage: image || undefined },
        })
        return
      case 'insight':
        push({
          slideType: s.slideType,
          layout: 'centered-insight',
          slots: {
            eyebrowLabel: eyebrow,
            title,
            dataPoint: keyNumber || undefined,
            dataLabel: keyLabel || subtitle || undefined,
            source: str(c.source) || undefined,
          },
        })
        return
      case 'metrics': {
        const stats = cardList.length
          ? cardList.slice(0, 4).map(cd => ({ value: cd.title, label: cd.body }))
          : keyNumber
            ? [{ value: keyNumber, label: keyLabel }]
            : []
        if (stats.length) {
          push({
            slideType: s.slideType,
            layout: 'numbered-stats',
            slots: { eyebrowLabel: eyebrow, title, stats, backgroundImage: image || undefined },
          })
          return
        }
        break // fall through to generic mapping below
      }
      case 'influencers': {
        const enriched = (args.enhancedInfluencers ?? []).filter(e => e?.name || e?.username)
        const influencers = enriched.length
          ? enriched.slice(0, 6).map(e => ({
              name: String(e.name || e.username || ''),
              handle: String(e.username || ''),
              followers: fmtFollowers(e.followers),
              engagement: e.engagementRate ? `${e.engagementRate.toFixed(1)}%` : '',
              profilePicUrl: e.profilePicUrl,
              isVerified: e.isVerified,
            }))
          : cardList.slice(0, 6).map(cd => ({
              name: cd.title,
              handle: '',
              followers: cd.body,
              engagement: '',
            }))
        push({
          slideType: s.slideType,
          layout: 'influencer-grid',
          slots: { eyebrowLabel: eyebrow, title, subtitle: subtitle || undefined, influencers },
        })
        return
      }
    }

    // Generic content slides (brief, goals, audience, strategy, bigIdea,
    // deliverables + any metrics/unknown fallthrough):
    if (cardList.length >= 2) {
      push({
        slideType: s.slideType,
        layout: 'three-pillars-grid',
        slots: {
          eyebrowLabel: eyebrow,
          title,
          pillars: cardList.slice(0, 3).map((cd, j) => ({ number: `0${j + 1}`, title: cd.title, description: cd.body })),
          sideImage: image || undefined,
        },
      })
      return
    }
    if (image && !bulletList.length && (body || subtitle)) {
      push({
        slideType: s.slideType,
        layout: 'full-bleed-image-text',
        slots: { image, eyebrowLabel: eyebrow, title, subtitle: subtitle || undefined, body: body || undefined },
      })
      return
    }
    // Bullets / plain text → split (alternating image side).
    imageSide = imageSide === 'left' ? 'right' : 'left'
    push({
      slideType: s.slideType,
      layout: 'split-image-text',
      slots: {
        image: image || '',
        imageSide,
        eyebrowLabel: eyebrow,
        title,
        bodyText: body || subtitle || undefined,
        bullets: bulletList.length ? bulletList : undefined,
      },
    })
  })

  return {
    brandName,
    brandLogoUrl: args.brandLogoUrl,
    designSystem: toDesignSystem(args.designSystem),
    slides: out,
  }
}
