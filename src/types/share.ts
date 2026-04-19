/**
 * Share Types — View-only presentation sharing
 */

// ============================================================
// VIEWER CONFIGURATION
// ============================================================

export interface ViewerConfig {
  mode: 'slideshow' | 'scroll'
  transitions: 'none' | 'fade' | 'slide' | 'zoom'
  autoPlay: boolean
  autoPlayInterval: number // ms
  showProgress: boolean
  showNav: boolean
  showToc: boolean
  allowFullscreen: boolean
  showBranding: boolean
  showCta: boolean
  ctaConfig?: CtaConfig
}

export interface CtaConfig {
  text: string        // "אשר הצעה", "קבע פגישה", "שלח הודעה"
  url?: string        // external link, calendly link, or phone number
  type: 'approve' | 'meeting' | 'link' | 'whatsapp'
}

export const DEFAULT_VIEWER_CONFIG: ViewerConfig = {
  mode: 'slideshow',
  transitions: 'fade',
  autoPlay: false,
  autoPlayInterval: 5000,
  showProgress: true,
  showNav: true,
  showToc: false,
  allowFullscreen: true,
  showBranding: true,
  showCta: false,
}

// ============================================================
// SHARE DATA
// ============================================================

export interface ShareData {
  id: string
  documentId: string
  userId: string
  shareToken: string
  isActive: boolean
  viewerConfig: ViewerConfig
  viewCount: number
  lastViewedAt: string | null
  createdAt: string
  updatedAt: string
}

// ============================================================
// ANALYTICS
// ============================================================

export interface ShareAnalyticsSession {
  id: string
  shareId: string
  sessionId: string
  slidesViewed: SlideViewEvent[]
  totalDurationMs: number
  ctaClicked: boolean
  createdAt: string
}

export interface SlideViewEvent {
  slideIndex: number
  viewedAt: string
  durationMs: number
}

export interface ShareAnalyticsSummary {
  totalViews: number
  uniqueSessions: number
  avgDurationMs: number
  ctaClickRate: number
  slideEngagement: { slideIndex: number; avgDurationMs: number; viewCount: number }[]
  lastViewedAt: string | null
}

// ============================================================
// API PAYLOADS
// ============================================================

export interface CreateSharePayload {
  documentId: string
  viewerConfig?: Partial<ViewerConfig>
}

export interface UpdateSharePayload {
  isActive?: boolean
  viewerConfig?: Partial<ViewerConfig>
}

export interface TrackEventPayload {
  sessionId: string
  slideIndex: number
  eventType: 'view' | 'cta_click' | 'duration'
  durationMs?: number
}

// ============================================================
// PUBLIC VIEWER DATA (returned to unauthenticated viewer)
// ============================================================

import type { Slide, DesignSystem } from './presentation'

export interface PublicPresentationData {
  presentation: {
    title: string
    designSystem: DesignSystem
    slides: Slide[]
  }
  viewerConfig: ViewerConfig
  brandName: string
  shareId: string
}
