/**
 * Premium Proposal Template - Extended Version
 * 12-15 slides with branded design
 * Canvas: 16:9 (1920x1080)
 * 
 * Features:
 * - Brand logo watermark
 * - Custom accent colors
 * - Dynamic shapes
 * - Rich content sections
 * - Israeli market focus
 */

import type { InfluencerStrategy } from '@/lib/gemini/influencer-research'

interface PremiumProposalData {
  // Meta
  brandName?: string
  issueDate?: string
  campaignName?: string
  campaignSubtitle?: string
  
  // Brand Brief - WHY are they coming to us?
  brandBrief?: string // The core challenge/need
  brandPainPoints?: string[] // What's hurting them?
  brandObjective?: string // What do they want to achieve?
  
  // Goals - Rich (short & practical)
  goals?: string[]
  goalsDetailed?: { title: string; description: string }[]
  
  // Target Audience - Detailed
  targetGender?: string
  targetAgeRange?: string
  targetDescription?: string
  targetBehavior?: string
  targetInsights?: string[]
  
  // Insight - Research-based key insight
  keyInsight?: string
  insightSource?: string
  insightData?: string
  
  // Strategy
  strategyHeadline?: string
  strategyDescription?: string
  strategyPillars?: { title: string; description: string }[]
  
  // Brand - Rich
  brandDescription?: string
  brandHighlights?: string[]
  brandOpportunity?: string
  brandValues?: string[]
  brandPersonality?: string[]
  
  // Activity - Detailed
  activityTitle?: string
  activityConcept?: string
  activityDescription?: string
  activityApproach?: { title: string; description: string }[]
  activityDifferentiator?: string
  
  // Deliverables
  deliverables?: string[]
  deliverablesDetailed?: { type: string; quantity: number; description: string; purpose: string }[]
  deliverablesSummary?: string
  
  // Metrics
  budget?: number
  currency?: string
  potentialReach?: number
  potentialEngagement?: number
  cpe?: number
  cpm?: number
  estimatedImpressions?: number
  metricsExplanation?: string
  
  // Influencer Strategy
  influencerStrategy?: string
  influencerCriteria?: string[]
  contentGuidelines?: string[]
  influencerResearch?: InfluencerStrategy
  
  // Scraped influencers with real profile data
  scrapedInfluencers?: {
    name?: string
    username?: string
    profilePicUrl?: string
    followers?: number
    engagementRate?: number
  }[]

  // Enhanced influencer data (new format with full demographics)
  enhancedInfluencers?: {
    name: string
    username: string
    profilePicUrl: string
    categories: string[]
    followers: number
    avgStoryViews?: number
    avgReelViews?: number
    engagementRate: number
    israeliAudiencePercent?: number
    genderSplit?: { male: number; female: number }
    ageSplit?: { range: string; percent: number }[]
    bio?: string
    isVerified?: boolean
  }[]

  // Influencer Data (manual)
  influencerData?: {
    name: string
    imageUrl?: string
    followers: number
    avgLikes?: number
    avgComments?: number
    engagementRate?: number
  }[]
  influencerNote?: string

  // Strategy Flow Chart
  strategyFlow?: {
    steps: { label: string; description: string; icon?: string }[]
  }

  // Creative multi-slide
  creativeSlides?: {
    title: string
    description: string
    referenceImages?: string[]
    conceptType?: string
  }[]

  // Quantities Summary
  quantitiesSummary?: {
    influencerCount: number
    contentTypes: { type: string; quantityPerInfluencer: number; totalQuantity: number }[]
    campaignDurationMonths: number
    totalDeliverables: number
    formula?: string
  }

  // Closing
  closingHeadline?: string
  nextSteps?: string[]
  
  // Visual Assets
  _brandColors?: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    palette: string[]
    style: string
    mood: string
  }
  _brandResearch?: {
    brandName?: string
    tagline?: string
    industry?: string
    marketPosition?: string
    visualIdentity?: {
      primaryColors: string[]
      style: string
      moodKeywords: string[]
    }
  }
  _scraped?: {
    logoUrl?: string
    screenshot?: string
    heroImages?: string[]
    productImages?: string[]
    lifestyleImages?: string[]
  }
  
  [key: string]: unknown
}

interface TemplateConfig {
  accentColor?: string
  brandLogoUrl?: string
  leadersLogoUrl?: string
  clientLogoUrl?: string
  images?: {
    brandImage?: string
    audienceImage?: string
    coverImage?: string
    activityImage?: string
  }
  // Extra images from smart generation
  extraImages?: {
    id: string
    url: string
    placement: string
  }[]
  // Image strategy info
  imageStrategy?: {
    conceptSummary?: string
    visualDirection?: string
    styleGuide?: string
  }
}

// Helper functions
function clean(arr?: unknown): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.filter(v => {
    if (!v || v === '__skipped__' || v === '') return false
    // Handle objects - skip them
    if (typeof v === 'object') return false
    return true
  }).map(String)
}

function formatNumber(num?: number): string {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return Math.round(num / 1000) + 'K'
  return num.toLocaleString()
}

function formatHebrewDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear()}`
  } catch {
    return dateStr
  }
}

function getCurrency(data: PremiumProposalData): string {
  if (data.currency?.includes('ILS') || data.currency?.includes('₪')) return '₪'
  if (data.currency?.includes('USD') || data.currency?.includes('$')) return '$'
  return '₪'
}

function adjustColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = Math.min(255, Math.max(0, (num >> 16) + amt))
  const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt))
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt))
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`
}

/**
 * Find an extra image by placement or similar placements
 */
function findExtraImage(
  extraImages: { id: string; url: string; placement: string }[] | undefined,
  ...placements: string[]
): string | undefined {
  if (!extraImages || extraImages.length === 0) return undefined
  
  for (const placement of placements) {
    const found = extraImages.find(img => 
      img.placement === placement || 
      img.placement.includes(placement) ||
      img.id.includes(placement)
    )
    if (found) return found.url
  }
  
  return undefined
}

/**
 * Generate Premium Proposal HTML slides
 */
export function generatePremiumProposalSlides(
  data: PremiumProposalData,
  config: TemplateConfig = {}
): string[] {
  const slides: string[] = []
  
  // Extract brand colors - use full palette
  const brandColors = data._brandColors
  const primary = config.accentColor || brandColors?.primary || '#E94560'
  const secondary = brandColors?.secondary || adjustColor(primary, -30)
  const accent = brandColors?.accent || adjustColor(primary, 20)
  const accentLight = adjustColor(primary, 40)
  const accentDark = adjustColor(primary, -20)
  
  // For backwards compatibility
  const primaryColor = primary
  
  // Logo URLs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const defaultLeadersLogo = `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const leadersLogo = config.leadersLogoUrl || defaultLeadersLogo
  const clientLogo = config.clientLogoUrl || data._scraped?.logoUrl || config.brandLogoUrl || ''
  
  // Fallback avatar SVG for influencers without profile pics
  const fallbackAvatar = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${primary}20"/><circle cx="50" cy="38" r="16" fill="${primary}50"/><ellipse cx="50" cy="72" rx="25" ry="18" fill="${primary}50"/></svg>`
  )}`

  // Currency
  const currency = getCurrency(data)
  
  // Base styles with brand customization
  const baseStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800;900&display=swap');
      @import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap');

      :root {
        /* Brand Colors */
        --primary: ${primary};
        --secondary: ${secondary};
        --accent: ${accent};
        --accent-light: ${accentLight};
        --accent-dark: ${accentDark};

        /* Leaders Brand */
        --leaders-gray: #1A1A2E;
        --leaders-gray-light: #636E72;

        /* Text Colors */
        --text: #0F0F0F;
        --text-light: #3D3D3D;
        --muted: #8A8A8A;

        /* Backgrounds - using brand colors */
        --light: ${primary}06;
        --light-secondary: ${secondary}0A;
        --line: ${primary}15;
        --white: #FFFFFF;
        --bg: #FAFAFA;
        --bg-gradient: linear-gradient(160deg, #FFFFFF 0%, ${primary}04 50%, ${secondary}03 100%);

        --h1: 58px;
        --h2: 46px;
        --h3: 34px;
        --body: 26px;
        --small: 17px;
        --tiny: 14px;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Heebo', sans-serif;
        background: var(--white);
        color: var(--text);
        direction: rtl;
        -webkit-font-smoothing: antialiased;
      }

      /* Fix brackets in RTL */
      .ltr-nums {
        direction: ltr;
        unicode-bidi: isolate;
        display: inline-block;
      }

      /* Numbers and punctuation should stay LTR */
      .metric-value, .stat-number, .price, .percentage {
        direction: ltr;
        unicode-bidi: embed;
      }

      .slide {
        width: 1920px;
        height: 1080px;
        position: relative;
        overflow: hidden;
        page-break-after: always;
        background: var(--bg-gradient);
      }

      .slide-content {
        padding: 80px 90px;
        height: 100%;
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: 10;
      }

      /* Brand watermark */
      .brand-watermark {
        position: absolute;
        bottom: 40px;
        left: 40px;
        opacity: 0.05;
        max-width: 300px;
        max-height: 150px;
        z-index: 1;
      }

      /* Accent shape decorations - using brand colors */
      .accent-shape {
        position: absolute;
        z-index: 1;
      }

      .accent-shape.corner-top-right {
        top: -120px;
        right: -120px;
        width: 500px;
        height: 500px;
        background: radial-gradient(circle, ${primary}18 0%, ${secondary}08 60%, transparent 100%);
        border-radius: 50%;
      }

      .accent-shape.corner-bottom-left {
        bottom: -180px;
        left: -180px;
        width: 600px;
        height: 600px;
        background: radial-gradient(circle, ${secondary}10 0%, ${primary}05 50%, transparent 100%);
        border-radius: 50%;
      }

      .accent-shape.stripe {
        top: 0;
        right: 0;
        width: 6px;
        height: 100%;
        background: linear-gradient(180deg, ${primary} 0%, ${accent} 50%, ${secondary} 100%);
      }

      /* Geometric decoration */
      .accent-shape.geo-dots {
        width: 200px;
        height: 200px;
        background-image: radial-gradient(circle, ${primary}15 2px, transparent 2px);
        background-size: 20px 20px;
      }

      /* Brand color accent line at bottom of slides */
      .slide::before {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 5px;
        background: linear-gradient(90deg, ${primary} 0%, ${accent} 40%, ${secondary} 100%);
        z-index: 100;
      }
      
      /* Logo header (kept for spacing, logos moved to footer) */
      .logo-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 40px;
        min-height: 0px;
      }

      .logo-header img {
        height: 70px;
        object-fit: contain;
      }

      .logo-header .client-logo {
        height: 90px;
      }

      /* Logo footer - bottom of each slide */
      .logo-footer {
        position: absolute;
        bottom: 20px;
        left: 30px;
        right: 30px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 10;
      }

      .logo-footer img {
        height: 35px;
        opacity: 0.7;
        object-fit: contain;
      }

      .logo-footer.inverted img {
        filter: brightness(0) invert(1);
        opacity: 0.7;
      }
      
      /* Typography */
      .h1 { font-size: var(--h1); font-weight: 800; line-height: 1.15; color: var(--text); letter-spacing: -0.5px; }
      .h2 { font-size: var(--h2); font-weight: 700; line-height: 1.2; color: var(--text); }
      .h3 { font-size: var(--h3); font-weight: 600; line-height: 1.3; color: var(--text); }
      .body { font-size: var(--body); font-weight: 400; line-height: 1.7; color: var(--text-light); }
      .small { font-size: var(--small); color: var(--muted); }

      .accent-text { color: ${primary}; }
      .accent-bg { background: linear-gradient(135deg, ${primary}, ${accent}); color: white; }
      
      /* Cards - with brand color accents */
      .card {
        background: linear-gradient(160deg, #FFFFFF 0%, ${primary}04 100%);
        border-radius: 20px;
        padding: 40px;
        border: 1.5px solid ${primary}18;
        position: relative;
      }

      .card::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 4px;
        height: 60%;
        background: linear-gradient(180deg, ${primary}, ${accent}, transparent);
        border-radius: 0 20px 0 0;
      }

      .card-accent {
        background: linear-gradient(135deg, ${primary} 0%, ${accentDark} 100%);
        color: white;
        border-radius: 20px;
        padding: 40px;
      }
      
      /* Grid */
      .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; }
      .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
      .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 30px; }
      
      /* Metrics */
      .metric-box {
        background: #FFFFFF;
        padding: 44px 36px;
        border-radius: 20px;
        border: 1.5px solid ${primary}15;
        position: relative;
        overflow: hidden;
        text-align: center;
      }

      .metric-box::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, ${primary}, ${accent});
      }

      .metric-value {
        font-size: 52px;
        font-weight: 800;
        background: linear-gradient(135deg, ${primary}, ${accent});
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1;
      }

      .metric-label {
        font-size: var(--small);
        color: var(--muted);
        margin-top: 14px;
        font-weight: 500;
        letter-spacing: 0.5px;
      }
      
      /* Bullet lists */
      .bullet-list {
        list-style: none;
        padding: 0;
      }

      .bullet-list li {
        font-size: var(--body);
        padding: 18px 0;
        border-bottom: 1px solid ${primary}08;
        display: flex;
        align-items: flex-start;
        gap: 18px;
      }

      .bullet-list li:last-child {
        border-bottom: none;
      }

      .bullet-marker {
        width: 10px;
        height: 10px;
        background: linear-gradient(135deg, ${primary}, ${accent});
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 10px;
      }
      
      /* Image containers */
      .image-container {
        border-radius: 24px;
        overflow: hidden;
        background: var(--light);
      }
      
      .image-container img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      
      .image-mask-circle {
        border-radius: 50%;
        overflow: hidden;
      }
      
      .image-mask-blob {
        clip-path: polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%);
        overflow: hidden;
      }
      
      /* Footer */
      .slide-footer {
        position: absolute;
        bottom: 40px;
        left: 80px;
        right: 80px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: var(--tiny);
        color: var(--muted);
        z-index: 20;
      }
      
      /* Influencer grid */
      .influencer-card {
        background: #FFFFFF;
        border: 1.5px solid ${primary}15;
        border-radius: 20px;
        padding: 30px;
        text-align: center;
        transition: all 0.3s ease;
      }

      .influencer-image {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        margin: 0 auto 20px;
        overflow: hidden;
        background: ${primary}08;
        border: 4px solid ${primary};
      }

      .influencer-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    </style>
  `

  // ========================================
  // SLIDE 1: COVER - Full screen image with large logos
  // ========================================
  const coverImage = config.images?.coverImage || 
    findExtraImage(config.extraImages, 'cover', 'hero') || 
    data._scraped?.heroImages?.[0] || ''
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-cover {
      background: ${coverImage ? `url('${coverImage}')` : `linear-gradient(135deg, var(--leaders-gray) 0%, ${primary} 100%)`};
      background-size: cover;
      background-position: center;
      position: relative;
    }
    .slide-cover::before {
      content: '';
      position: absolute;
      inset: 0;
      /* Subtle gradient overlay - not box behind text */
      background: linear-gradient(to top,
        rgba(0,0,0,0.45) 0%,
        rgba(0,0,0,0.18) 35%,
        rgba(0,0,0,0.05) 65%,
        ${primary}15 100%);
    }
    .slide.slide-cover::before {
      bottom: 4px; /* Don't cover the brand line */
    }
    .slide-cover .slide-content {
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }
    .slide-cover .top-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      width: 100%;
    }
    .slide-cover .main-title {
      font-size: 110px;
      font-weight: 900;
      color: white;
      max-width: 1000px;
      line-height: 1.05;
      /* Removed text-shadow to avoid gray box appearance in PDF */
    }
    .slide-cover .subtitle {
      font-size: 36px;
      color: rgba(255,255,255,0.9);
      margin-top: 24px;
      font-weight: 300;
    }
    .slide-cover .meta {
      display: flex;
      gap: 60px;
      color: rgba(255,255,255,0.7);
      font-size: 22px;
    }
    .slide-cover .meta-item {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .slide-cover .client-logo-hero {
      height: 160px;
      max-width: 400px;
      object-fit: contain;
      filter: brightness(0) invert(1) drop-shadow(0 2px 10px rgba(0,0,0,0.5));
    }
    .slide-cover .leaders-logo-hero {
      height: 80px;
      filter: brightness(0) invert(1);
      opacity: 0.9;
    }
    .slide-cover .bottom-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      width: 100%;
    }
    .slide-cover .accent-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--accent);
    }
  </style>
</head>
<body>
  <div class="slide slide-cover">
    <div class="slide-content">
      <div class="top-section">
        ${clientLogo ? `<img src="${clientLogo}" alt="Client" class="client-logo-hero">` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders" class="leaders-logo-hero">
      </div>
      
      <div>
        <h1 class="main-title">${data.campaignName || data.brandName || 'הצעת מחיר'}</h1>
        ${data.campaignSubtitle ? `<p class="subtitle">${data.campaignSubtitle}</p>` : ''}
      </div>
      
      <div class="bottom-section">
        <div class="meta">
          <div class="meta-item">${formatHebrewDate(data.issueDate)}</div>
        </div>
      </div>
    </div>
    <div class="accent-bar"></div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 2: THE BRIEF - Why are they coming to us?
  // ========================================
  const brandImage = config.images?.brandImage || 
    findExtraImage(config.extraImages, 'brand', 'lifestyle', 'product') || 
    data._scraped?.heroImages?.[1] || ''
  const briefText = data.brandBrief || data.brandOpportunity || data.brandDescription || ''
  const painPoints = data.brandPainPoints || data.brandHighlights || []
  
  if (briefText || painPoints.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-brief {
      background: var(--bg-gradient);
    }
    .slide-brief .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
    }
    .slide-brief .text-side {
      flex: 1.2;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-brief .visual-side {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    .slide-brief .section-label {
      font-size: 18px;
      color: var(--accent);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 16px;
    }
    .slide-brief .h1 {
      font-size: 64px;
      margin-bottom: 40px;
    }
    .slide-brief .brief-text {
      font-size: 28px;
      line-height: 1.7;
      color: var(--text-light);
      margin-bottom: 50px;
    }
    .slide-brief .pain-points {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .slide-brief .pain-item {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 22px 28px;
      background: white;
      border-radius: 16px;
      border: 1.5px solid ${primary}12;
      border-right: 4px solid ${primary};
    }
    .slide-brief .pain-icon {
      width: 46px;
      height: 46px;
      background: linear-gradient(135deg, ${primary}, ${accent});
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 22px;
      flex-shrink: 0;
    }
    .slide-brief .pain-text {
      font-size: 22px;
      color: var(--text);
      font-weight: 500;
    }
    .slide-brief .client-logo-large {
      max-height: 180px;
      max-width: 350px;
      object-fit: contain;
      margin-bottom: 40px;
    }
    .slide-brief .brand-image-container {
      width: 100%;
      height: 400px;
      border-radius: 30px;
      overflow: hidden;
      background: var(--light);
    }
    .slide-brief .brand-image-container img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  </style>
</head>
<body>
  <div class="slide slide-brief">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="main-content">
        <div class="text-side">
          <div class="section-label">הבריף</div>
          <h1 class="h1">למה התכנסנו?</h1>
          ${briefText ? `<div class="brief-text">${briefText}</div>` : ''}
          
          ${painPoints.length > 0 ? `
          <div class="pain-points">
            ${painPoints.slice(0, 3).map((p, i) => `
            <div class="pain-item">
              <div class="pain-icon">${i + 1}</div>
              <div class="pain-text">${p}</div>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="visual-side">
          ${clientLogo ? `<img src="${clientLogo}" alt="${data.brandName}" class="client-logo-large">` : ''}
          ${brandImage ? `
          <div class="brand-image-container">
            <img src="${brandImage}" alt="Brand">
          </div>
          ` : ''}
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 3: GOALS
  // ========================================
  const goals = clean(data.goals)
  const goalsDetailed = data.goalsDetailed || []
  
  if (goals.length > 0 || goalsDetailed.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-goals .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-goals .goals-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(goals.length || goalsDetailed.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-goals .goal-card {
      background: #FFFFFF;
      padding: 50px 40px;
      border-radius: 20px;
      text-align: center;
      border-top: 4px solid ${primary};
      border: 1.5px solid ${primary}12;
      border-top: 4px solid ${primary};
      position: relative;
    }
    .slide-goals .goal-card::after {
      content: '';
      position: absolute;
      top: 4px;
      left: 0;
      right: 0;
      height: 60px;
      background: linear-gradient(180deg, ${primary}05, transparent);
    }
    .slide-goals .goal-number {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, ${primary}, ${accent});
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 700;
      margin: 0 auto 24px;
      position: relative;
      z-index: 1;
    }
    .slide-goals .goal-title {
      font-size: 30px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 16px;
      position: relative;
      z-index: 1;
    }
    .slide-goals .goal-desc {
      font-size: 18px;
      color: var(--text-light);
      line-height: 1.6;
      position: relative;
      z-index: 1;
    }
  </style>
</head>
<body>
  <div class="slide slide-goals">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">מטרות הקמפיין</h1>
        <div class="goals-grid">
          ${(goalsDetailed.length > 0 ? goalsDetailed : goals.map(g => ({ title: g, description: '' }))).slice(0, 4).map((g, i) => `
          <div class="goal-card">
            <div class="goal-number">${i + 1}</div>
            <div class="goal-title">${typeof g === 'string' ? g : g.title}</div>
            ${typeof g !== 'string' && g.description ? `<div class="goal-desc">${g.description}</div>` : ''}
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    ${clientLogo ? `<img src="${clientLogo}" class="brand-watermark" alt="">` : ''}
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 4: TARGET AUDIENCE
  // ========================================
  const audienceImage = config.images?.audienceImage || 
    findExtraImage(config.extraImages, 'audience', 'social', 'lifestyle') || 
    data._scraped?.lifestyleImages?.[0] || ''
  
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-audience .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
      align-items: center;
    }
    .slide-audience .text-side {
      flex: 1.2;
    }
    .slide-audience .visual-side {
      flex: 0.8;
    }
    .slide-audience .audience-image {
      width: 100%;
      height: 600px;
      border-radius: 30px;
      overflow: hidden;
      background: var(--light);
      clip-path: polygon(10% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 10%);
    }
    .slide-audience .audience-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-audience .audience-main {
      display: flex;
      gap: 40px;
      margin-top: 40px;
    }
    .slide-audience .audience-card {
      background: var(--light);
      padding: 30px;
      border-radius: 20px;
      flex: 1;
    }
    .slide-audience .audience-label {
      font-size: 16px;
      color: var(--muted);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .slide-audience .audience-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
    }
    .slide-audience .behavior-text {
      font-size: 24px;
      line-height: 1.7;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-audience .insights-list {
      margin-top: 40px;
    }
    .slide-audience .insight-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      font-size: 22px;
      color: var(--text);
    }
    .slide-audience .insight-bullet {
      width: 10px;
      height: 10px;
      background: var(--accent);
      border-radius: 50%;
    }
  </style>
</head>
<body>
  <div class="slide slide-audience">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">קהל היעד</h1>
          
          <div class="audience-main">
            <div class="audience-card">
              <div class="audience-label">מגדר</div>
              <div class="audience-value">${data.targetGender || 'נשים וגברים'}</div>
            </div>
            <div class="audience-card">
              <div class="audience-label">גיל</div>
              <div class="audience-value">${data.targetAgeRange || '25-45'}</div>
            </div>
          </div>
          
          ${data.targetDescription ? `
          <p class="behavior-text">${data.targetDescription}</p>
          ` : ''}
          
          ${data.targetInsights && data.targetInsights.length > 0 ? `
          <div class="insights-list">
            ${data.targetInsights.slice(0, 4).map(insight => `
            <div class="insight-item">
              <span class="insight-bullet"></span>
              <span>${insight}</span>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="visual-side">
          <div class="audience-image">
            ${audienceImage ? `<img src="${audienceImage}" alt="Target Audience">` : ''}
          </div>
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 5: KEY INSIGHT - Research-based insight
  // ========================================
  const insightText = data.keyInsight || data.brandOpportunity || ''
  if (insightText) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-insight {
      background: linear-gradient(135deg, var(--leaders-gray) 0%, ${secondary} 50%, ${primary} 100%);
      position: relative;
      overflow: hidden;
    }
    .slide-insight::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(circle at 80% 20%, ${primary}40 0%, transparent 50%),
                  radial-gradient(circle at 20% 80%, ${secondary}30 0%, transparent 40%);
    }
    .slide-insight .slide-content {
      justify-content: center;
      position: relative;
      z-index: 10;
    }
    .slide-insight .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      max-width: 1200px;
      margin: 0 auto;
    }
    .slide-insight .section-label {
      font-size: 18px;
      color: rgba(255,255,255,0.8);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 4px;
      margin-bottom: 30px;
      background: rgba(255,255,255,0.1);
      padding: 12px 30px;
      border-radius: 30px;
    }
    .slide-insight .insight-text {
      font-size: 42px;
      font-weight: 700;
      color: white;
      line-height: 1.4;
      text-wrap: balance;
    }
    .slide-insight .insight-source {
      font-size: 18px;
      color: rgba(255,255,255,0.8);
      margin-top: 50px;
      font-style: italic;
      background: rgba(255,255,255,0.1);
      padding: 10px 25px;
      border-radius: 20px;
    }
    .slide-insight .quote-mark {
      font-size: 200px;
      color: rgba(255,255,255,0.08);
      position: absolute;
      top: 60px;
      right: 80px;
      font-family: Georgia, serif;
    }
    .slide-insight .logo-footer img {
      filter: brightness(0) invert(1);
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="slide slide-insight">
    <div class="quote-mark">"</div>
    <div class="slide-content">
      <div class="main-content">
        <div class="section-label">התובנה המרכזית</div>
        <div class="insight-text">${insightText}</div>
        ${data.insightSource ? `<div class="insight-source">מקור: ${data.insightSource}</div>` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 6: STRATEGY
  // ========================================
  const strategyPillars = data.strategyPillars || data.activityApproach || []
  const strategyHeadline = data.strategyHeadline || data.influencerStrategy || ''
  
  if (strategyHeadline || strategyPillars.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-strategy .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .slide-strategy .strategy-header {
      margin-bottom: 50px;
    }
    .slide-strategy .strategy-desc {
      font-size: 26px;
      color: var(--text-light);
      line-height: 1.6;
      margin-top: 24px;
      max-width: 900px;
    }
    .slide-strategy .pillars-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(strategyPillars.length || 3, 3)}, 1fr);
      gap: 40px;
      flex: 1;
    }
    .slide-strategy .pillar-card {
      background: white;
      padding: 50px 40px;
      border-radius: 24px;
      border: 1.5px solid rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      border-bottom: 5px solid var(--accent);
    }
    .slide-strategy .pillar-number {
      width: 50px;
      height: 50px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 24px;
    }
    .slide-strategy .pillar-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 16px;
    }
    .slide-strategy .pillar-desc {
      font-size: 18px;
      color: var(--text-light);
      line-height: 1.6;
      flex: 1;
    }
  </style>
</head>
<body>
  <div class="slide slide-strategy">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="main-content">
        <div class="strategy-header">
          <h1 class="h1">האסטרטגיה</h1>
          ${strategyHeadline ? `<p class="strategy-desc">${strategyHeadline}</p>` : ''}
        </div>
        
        ${data.strategyFlow?.steps?.length ? `
        <div style="display:flex; align-items:flex-start; justify-content:center; gap:10px; margin-top:40px; position:relative;">
          ${data.strategyFlow.steps.map((step, i) => `
            ${i > 0 ? `<div style="display:flex;align-items:center;padding-top:35px;font-size:40px;color:var(--accent);">&#8592;</div>` : ''}
            <div style="flex:1;max-width:350px;text-align:center;background:var(--white);border-radius:20px;padding:30px 20px;border:1.5px solid rgba(0,0,0,0.08);border-bottom:4px solid var(--accent);">
              <div style="width:50px;height:50px;background:var(--accent);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;margin:0 auto 15px;">${i + 1}</div>
              <div style="font-size:22px;font-weight:700;color:var(--text);margin-bottom:10px;">${step.label}</div>
              <div style="font-size:16px;color:var(--text-light);line-height:1.5;">${step.description}</div>
            </div>
          `).join('')}
        </div>
        ` : strategyPillars.length > 0 ? `
        <div class="pillars-grid">
          ${strategyPillars.slice(0, 3).map((p, i) => `
          <div class="pillar-card">
            <div class="pillar-number">${i + 1}</div>
            <div class="pillar-title">${p.title}</div>
            <div class="pillar-desc">${p.description || ''}</div>
          </div>
          `).join('')}
        </div>
        ` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 7: THE BIG IDEA (Activity)
  // ========================================
  const activityImage = config.images?.activityImage || 
    findExtraImage(config.extraImages, 'activity', 'product', 'work') || 
    data._scraped?.lifestyleImages?.[1] || ''
  
  if (data.activityTitle || data.activityConcept) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-big-idea {
      background: var(--text);
      color: white;
    }
    .slide-big-idea .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-big-idea h1 {
      color: white;
      font-size: 80px;
    }
    .slide-big-idea .concept-text {
      font-size: 36px;
      line-height: 1.6;
      color: rgba(255,255,255,0.8);
      margin-top: 40px;
      max-width: 1200px;
    }
    .slide-big-idea .logo-footer img {
      filter: brightness(0) invert(1);
      opacity: 0.7;
    }
    .slide-big-idea .accent-line {
      width: 150px;
      height: 6px;
      background: var(--accent);
      margin-top: 40px;
    }
    .slide-big-idea .activity-desc {
      font-size: 24px;
      line-height: 1.8;
      color: rgba(255,255,255,0.7);
      margin-top: 40px;
      max-width: 1000px;
    }
  </style>
</head>
<body>
  <div class="slide slide-big-idea">
    <div class="slide-content">
      <div class="main-content">
        <h1>${data.activityTitle || 'הרעיון המרכזי'}</h1>
        <div class="accent-line"></div>
        ${data.activityConcept ? `<p class="concept-text">${data.activityConcept}</p>` : ''}
        ${data.activityDescription ? `<p class="activity-desc">${data.activityDescription}</p>` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 8: ACTIVITY APPROACH
  // ========================================
  if (data.activityApproach && data.activityApproach.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-approach .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-approach .approach-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(data.activityApproach.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-approach .approach-card {
      background: var(--light);
      padding: 50px 40px;
      border-radius: 24px;
      border-right: 5px solid var(--accent);
    }
    .slide-approach .approach-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 20px;
    }
    .slide-approach .approach-desc {
      font-size: 20px;
      line-height: 1.7;
      color: var(--text-light);
    }
    .slide-approach .differentiator {
      background: var(--accent);
      color: white;
      padding: 40px;
      border-radius: 20px;
      margin-top: 50px;
      font-size: 24px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="slide slide-approach">
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">הגישה שלנו</h1>
        
        <div class="approach-grid">
          ${data.activityApproach.slice(0, 3).map(a => `
          <div class="approach-card">
            <div class="approach-title">${a.title}</div>
            <div class="approach-desc">${a.description}</div>
          </div>
          `).join('')}
        </div>
        
        ${data.activityDifferentiator ? `
        <div class="differentiator">
          ${data.activityDifferentiator}
        </div>
        ` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE: CREATIVE CLOSING - After creative section
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-creative-close {
      background: linear-gradient(135deg, var(--leaders-gray) 0%, ${secondary} 50%, ${primary} 100%);
      position: relative;
      overflow: hidden;
    }
    .slide-creative-close::after {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle at 30% 70%, ${primary}35 0%, transparent 50%),
                  radial-gradient(circle at 70% 30%, ${secondary}25 0%, transparent 40%);
    }
    .slide-creative-close .slide-content {
      justify-content: center;
      align-items: center;
      text-align: center;
      position: relative;
      z-index: 10;
    }
    .slide-creative-close .headline {
      font-size: 96px;
      font-weight: 900;
      color: white;
      line-height: 1.1;
      margin-bottom: 30px;
      /* Removed text-shadow to avoid gray box appearance in PDF */
      letter-spacing: -2px;
    }
    .slide-creative-close .subline {
      font-size: 32px;
      color: rgba(255,255,255,0.85);
      max-width: 900px;
      line-height: 1.5;
      font-weight: 300;
    }
    .slide-creative-close .logo-footer img {
      filter: brightness(0) invert(1);
      opacity: 0.7;
    }
    .slide-creative-close .accent-line {
      width: 120px;
      height: 6px;
      background: ${accent};
      margin: 40px auto;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="slide slide-creative-close">
    <div class="slide-content">
      <h1 class="headline">זה הזמן ליצור</h1>
      <div class="accent-line"></div>
      <p class="subline">${data.activityDifferentiator || 'מוכנים לקחת את המותג לשלב הבא'}</p>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 9: DELIVERABLES
  // ========================================
  const deliverables = data.deliverablesDetailed || []
  const deliverableStrings = clean(data.deliverables)
  
  if (deliverables.length > 0 || deliverableStrings.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-deliverables .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-deliverables .deliverables-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(deliverables.length || deliverableStrings.length, 3)}, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-deliverables .deliverable-card {
      background: var(--light);
      padding: 50px;
      border-radius: 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .slide-deliverables .deliverable-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 6px;
      background: var(--accent);
    }
    .slide-deliverables .deliverable-qty {
      font-size: 72px;
      font-weight: 900;
      color: var(--accent);
      line-height: 1;
    }
    .slide-deliverables .deliverable-type {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-top: 16px;
    }
    .slide-deliverables .deliverable-desc {
      font-size: 18px;
      color: var(--muted);
      margin-top: 12px;
    }
    .slide-deliverables .summary {
      text-align: center;
      font-size: 24px;
      color: var(--text-light);
      margin-top: 50px;
    }
  </style>
</head>
<body>
  <div class="slide slide-deliverables">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">תוצרים</h1>
        
        <div class="deliverables-grid">
          ${deliverables.length > 0 
            ? deliverables.slice(0, 6).map(d => `
              <div class="deliverable-card">
                <div class="deliverable-qty">${d.quantity}</div>
                <div class="deliverable-type">${d.type}</div>
                <div class="deliverable-desc">${d.description || ''}</div>
              </div>
              `).join('')
            : deliverableStrings.slice(0, 6).map(d => `
              <div class="deliverable-card">
                <div class="deliverable-type">${d}</div>
              </div>
              `).join('')
          }
        </div>
        
        ${data.deliverablesSummary ? `<p class="summary">${data.deliverablesSummary}</p>` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 9.5: QUANTITIES SUMMARY (NEW)
  // ========================================
  const qs = data.quantitiesSummary
  if (qs && qs.contentTypes?.length > 0) {
    const grandTotal = qs.totalDeliverables || qs.contentTypes.reduce((sum, ct) => sum + (ct.totalQuantity || 0), 0)
    const formulaText = qs.formula || `${qs.influencerCount} משפיענים × ${qs.contentTypes.length} סוגי תוכן × ${qs.campaignDurationMonths} חודשים = ${grandTotal} תוצרים`

    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-quantities .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-quantities .quantities-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 50px;
      font-size: 24px;
    }
    .slide-quantities .quantities-table th {
      background: var(--accent);
      color: white;
      padding: 20px 30px;
      text-align: center;
      font-weight: 700;
      font-size: 22px;
    }
    .slide-quantities .quantities-table td {
      padding: 20px 30px;
      text-align: center;
      border-bottom: 1px solid var(--line);
    }
    .slide-quantities .quantities-table tr:nth-child(even) td {
      background: var(--light);
    }
    .slide-quantities .total-row td {
      background: ${adjustColor(primary, -10)} !important;
      color: white;
      font-weight: 800;
      font-size: 28px;
    }
    .slide-quantities .formula-box {
      text-align: center;
      margin-top: 50px;
      font-size: 36px;
      font-weight: 700;
      color: var(--accent);
      padding: 30px;
      background: var(--light);
      border-radius: 20px;
    }
  </style>
</head>
<body>
  <div class="slide slide-quantities">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">סיכום כמויות</h1>

        <table class="quantities-table">
          <thead>
            <tr>
              <th>#</th>
              <th>סוג תוכן</th>
              <th>לכל משפיען</th>
              <th>משפיענים</th>
              <th>חודשים</th>
              <th>סה"כ</th>
            </tr>
          </thead>
          <tbody>
            ${qs.contentTypes.map((ct, i) => `
              <tr>
                <td>${i + 1}</td>
                <td style="font-weight:600">${ct.type}</td>
                <td class="ltr-nums">${ct.quantityPerInfluencer}</td>
                <td class="ltr-nums">${qs.influencerCount}</td>
                <td class="ltr-nums">${qs.campaignDurationMonths}</td>
                <td class="ltr-nums" style="font-weight:700">${ct.totalQuantity || ct.quantityPerInfluencer * qs.influencerCount * qs.campaignDurationMonths}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="5">סה"כ תוצרים</td>
              <td class="ltr-nums">${grandTotal}</td>
            </tr>
          </tbody>
        </table>

        <div class="formula-box">${formulaText}</div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 10: METRICS & KPIs (Enhanced with CPE formula)
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-metrics .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-metrics .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    .slide-metrics .metric-card {
      background: var(--light);
      padding: 50px 30px;
      border-radius: 24px;
      text-align: center;
    }
    .slide-metrics .metric-card.primary {
      background: var(--accent);
      color: white;
    }
    .slide-metrics .metric-card.primary .metric-value {
      color: white;
    }
    .slide-metrics .metric-card.primary .metric-label {
      color: rgba(255,255,255,0.8);
    }
    .slide-metrics .metric-value {
      font-size: 52px;
      font-weight: 800;
      color: var(--accent);
      line-height: 1;
    }
    .slide-metrics .metric-label {
      font-size: 18px;
      color: var(--muted);
      margin-top: 16px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .slide-metrics .explanation {
      margin-top: 50px;
      padding: 40px;
      background: var(--light);
      border-radius: 20px;
      font-size: 22px;
      line-height: 1.7;
      color: var(--text-light);
    }
  </style>
</head>
<body>
  <div class="slide slide-metrics">
    <div class="accent-shape stripe"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">יעדים ומדדים</h1>
        
        <div class="metrics-grid">
          <div class="metric-card primary">
            <div class="metric-value">${currency}${formatNumber(data.budget)}</div>
            <div class="metric-label">תקציב</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${formatNumber(data.potentialReach || data.potentialEngagement ? (data.potentialEngagement || 0) * 3 : 0)}</div>
            <div class="metric-label">Reach</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${formatNumber(data.potentialEngagement)}</div>
            <div class="metric-label">Engagement</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${currency}${data.cpe || '2.5'}</div>
            <div class="metric-label">CPE</div>
          </div>
        </div>
        
        ${data.budget && data.potentialEngagement ? `
        <div style="text-align:center; margin-top: 40px; padding: 30px; background: var(--light); border-radius: 20px;">
          <div style="font-size: 20px; color: var(--muted); margin-bottom: 10px;">נוסחת CPE</div>
          <div style="font-size: 36px; font-weight: 700; color: var(--accent); direction: ltr; unicode-bidi: isolate;">
            ${currency}${formatNumber(data.budget)} &divide; ${formatNumber(data.potentialEngagement)} = ${currency}${data.cpe || (data.budget / data.potentialEngagement).toFixed(2)}
          </div>
          <div style="font-size: 16px; color: var(--muted); margin-top: 8px;">Budget &divide; Engagement = CPE</div>
        </div>
        ` : data.metricsExplanation ? `
        <div class="explanation">${data.metricsExplanation}</div>
        ` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)

  // ========================================
  // SLIDE 11: INFLUENCER STRATEGY
  // ========================================
  if (data.influencerStrategy || data.influencerCriteria?.length) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-inf-strategy .main-content {
      flex: 1;
      display: flex;
      gap: 80px;
    }
    .slide-inf-strategy .text-side {
      flex: 1.2;
    }
    .slide-inf-strategy .criteria-side {
      flex: 0.8;
    }
    .slide-inf-strategy .strategy-text {
      font-size: 26px;
      line-height: 1.8;
      color: var(--text-light);
      margin-top: 40px;
    }
    .slide-inf-strategy .criteria-box {
      background: var(--light);
      padding: 50px;
      border-radius: 24px;
      margin-top: 60px;
    }
    .slide-inf-strategy .criteria-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 30px;
    }
    .slide-inf-strategy .criteria-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
      font-size: 20px;
    }
    .slide-inf-strategy .criteria-item:last-child {
      border-bottom: none;
    }
    .slide-inf-strategy .criteria-check {
      color: var(--accent);
      font-weight: bold;
    }
    .slide-inf-strategy .content-guidelines {
      background: var(--accent);
      color: white;
      padding: 40px;
      border-radius: 24px;
      margin-top: 40px;
    }
    .slide-inf-strategy .content-guidelines h3 {
      color: white;
      margin-bottom: 20px;
    }
    .slide-inf-strategy .guideline-item {
      padding: 12px 0;
      font-size: 20px;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="slide slide-inf-strategy">
    <div class="slide-content">
      <div class="main-content">
        <div class="text-side">
          <h1 class="h1">אסטרטגיית משפיענים</h1>
          ${data.influencerStrategy ? `<p class="strategy-text">${data.influencerStrategy}</p>` : ''}
          
          ${data.contentGuidelines && data.contentGuidelines.length > 0 ? `
          <div class="content-guidelines">
            <h3 class="h3">הנחיות לתוכן</h3>
            ${data.contentGuidelines.slice(0, 4).map(g => `
            <div class="guideline-item">• ${g}</div>
            `).join('')}
          </div>
          ` : ''}
        </div>
        
        <div class="criteria-side">
          ${data.influencerCriteria && data.influencerCriteria.length > 0 ? `
          <div class="criteria-box">
            <div class="criteria-title">קריטריונים לבחירה</div>
            ${data.influencerCriteria.slice(0, 6).map(c => `
            <div class="criteria-item">
              <span class="criteria-check">✓</span>
              <span>${c}</span>
            </div>
            `).join('')}
          </div>
          ` : ''}
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 12: RECOMMENDED INFLUENCERS (AI + Scraped with photos)
  // ========================================
  const aiRecommendations = data.influencerResearch?.recommendations || []
  const scrapedInfluencers = (data.scrapedInfluencers as Array<{
    name?: string
    username?: string
    profilePicUrl?: string
    followers?: number
    engagementRate?: number
    avgStoryViews?: number | string
  }>) || []
  
  // Filter: Only include influencers with 10K+ followers
  const filteredScraped = scrapedInfluencers.filter(inf => !inf.followers || inf.followers >= 10000)
  const filteredAI = aiRecommendations.filter(inf => {
    // Parse followers string like "15K" or "150K" to number
    const followersStr = inf.followers || ''
    const match = followersStr.match(/(\d+(?:\.\d+)?)\s*([KMk])?/)
    if (!match) return true // If can't parse, keep it
    let num = parseFloat(match[1])
    if (match[2]?.toUpperCase() === 'K') num *= 1000
    if (match[2]?.toUpperCase() === 'M') num *= 1000000
    return num >= 10000
  })
  
  // Merge: prefer scraped (has photos) over AI recommendations
  const mergedInfluencers = [
    // First add scraped influencers (they have real photos)
    ...filteredScraped.map(inf => ({
      name: inf.name || inf.username || 'משפיען',
      handle: inf.username ? `@${inf.username}` : '',
      followers: inf.followers ? formatNumber(inf.followers) : '10K+',
      engagement: inf.engagementRate ? `${inf.engagementRate.toFixed(1)}%` : '3%+',
      avgStoryViews: inf.avgStoryViews ? (typeof inf.avgStoryViews === 'number' ? formatNumber(inf.avgStoryViews) : inf.avgStoryViews) : '--',
      whyRelevant: 'משפיען מתאים לקהל היעד של המותג',
      profilePicUrl: inf.profilePicUrl || '',
    })),
    // Then add AI recommendations - try to use profileUrl for scraping later
    ...filteredAI.map(inf => ({
      name: inf.name,
      handle: inf.handle,
      followers: inf.followers,
      engagement: inf.engagement,
      avgStoryViews: (inf as { avgStoryViews?: string }).avgStoryViews || '--',
      whyRelevant: inf.whyRelevant,
      profilePicUrl: (inf as { profilePicUrl?: string }).profilePicUrl || '', // May have been enriched
      profileUrl: inf.profileUrl || '', // Instagram profile URL
    })),
  ].slice(0, 6) // Max 6 influencers
  
  if (mergedInfluencers.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-recommendations .main-content {
      flex: 1;
    }
    .slide-recommendations .influencers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 30px;
      margin-top: 50px;
    }
    .slide-recommendations .influencer-card {
      background: linear-gradient(145deg, var(--white) 0%, var(--light) 100%);
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 35px 30px;
      text-align: center;
      border: 1px solid rgba(0,0,0,0.06);
      position: relative;
      overflow: hidden;
    }
    .slide-recommendations .influencer-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--accent), var(--accent-light));
    }
    .slide-recommendations .influencer-avatar {
      width: 110px;
      height: 110px;
      background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 50%, var(--leaders-gray-light) 100%);
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 40px;
      font-weight: 700;
      overflow: hidden;
      border: 4px solid var(--accent);
      border: 2px solid rgba(0,0,0,0.10);
      position: relative;
    }
    .slide-recommendations .influencer-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      position: absolute;
      top: 0;
      left: 0;
    }
    .slide-recommendations .influencer-avatar .avatar-letter {
      font-size: 40px;
      font-weight: 700;
      color: white;
      text-transform: uppercase;
    }
    .slide-recommendations .influencer-name {
      font-size: 22px;
      font-weight: 700;
      color: var(--text);
    }
    .slide-recommendations .influencer-handle {
      font-size: 16px;
      color: var(--accent);
      margin-top: 4px;
    }
    .slide-recommendations .influencer-stats {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin-top: 20px;
      background: var(--light);
      border-radius: 12px;
      padding: 15px 10px;
    }
    .slide-recommendations .stat {
      text-align: center;
      flex: 1;
    }
    .slide-recommendations .stat-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--accent);
    }
    .slide-recommendations .stat-label {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
    }
    .slide-recommendations .influencer-reason {
      font-size: 14px;
      color: var(--text-light);
      margin-top: 16px;
      line-height: 1.5;
    }
    .slide-recommendations .note {
      text-align: center;
      font-size: 16px;
      color: var(--muted);
      margin-top: 40px;
    }
  </style>
</head>
<body>
  <div class="slide slide-recommendations">
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">משפיענים מומלצים</h1>
        
        <div class="influencers-grid">
          ${mergedInfluencers.map(inf => `
          <div class="influencer-card">
            <div class="influencer-avatar">
              <span class="avatar-letter">${inf.name.charAt(0).toUpperCase()}</span>
              <img src="${inf.profilePicUrl || fallbackAvatar}" alt="${inf.name}" onerror="this.style.display='none';" loading="lazy">
            </div>
            <div class="influencer-name">${inf.name}</div>
            <div class="influencer-handle">${inf.handle}</div>
            <div class="influencer-stats">
              <div class="stat">
                <div class="stat-value">${inf.followers}</div>
                <div class="stat-label">עוקבים</div>
              </div>
              <div class="stat">
                <div class="stat-value">${inf.engagement}</div>
                <div class="stat-label">מעורבות</div>
              </div>
              <div class="stat">
                <div class="stat-value">${inf.avgStoryViews}</div>
                <div class="stat-label">צפיות סטורי</div>
              </div>
            </div>
          </div>
          `).join('')}
        </div>
        
        <div class="note">* רשימה ראשונית - הבחירה הסופית תיעשה בשיתוף הלקוח</div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 13: MANUAL INFLUENCERS (if provided)
  // ========================================
  const manualInfluencers = data.influencerData || []
  if (manualInfluencers.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-manual-inf .main-content {
      flex: 1;
    }
    .slide-manual-inf .influencers-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 40px;
      margin-top: 50px;
      flex: 1;
    }
    .slide-manual-inf .influencer-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .slide-manual-inf .influencer-image {
      width: 160px;
      height: 160px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--light);
      border: 5px solid var(--accent);
    }
    .slide-manual-inf .influencer-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .slide-manual-inf .influencer-name {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      margin-top: 20px;
    }
    .slide-manual-inf .influencer-followers {
      font-size: 18px;
      color: var(--accent);
      font-weight: 600;
    }
    .slide-manual-inf .note {
      text-align: center;
      font-size: 18px;
      color: var(--muted);
      margin-top: 30px;
    }
  </style>
</head>
<body>
  <div class="slide slide-manual-inf">
    <div class="accent-shape corner-top-right"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">משפיענים</h1>
        
        <div class="influencers-grid">
          ${manualInfluencers.slice(0, 6).map(inf => `
          <div class="influencer-item">
            <div class="influencer-image">
              ${inf.imageUrl ? `<img src="${inf.imageUrl}" alt="${inf.name}">` : ''}
            </div>
            <div class="influencer-name">${inf.name}</div>
            <div class="influencer-followers">${formatNumber(inf.followers)} עוקבים</div>
          </div>
          `).join('')}
        </div>
        
        ${data.influencerNote ? `<div class="note">${data.influencerNote}</div>` : ''}
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 13.5: ENHANCED INFLUENCERS (NEW - with full demographics)
  // ========================================
  const enhancedInf = data.enhancedInfluencers || []
  if (enhancedInf.length > 0) {
    // Split into batches of 3
    for (let batch = 0; batch < enhancedInf.length; batch += 3) {
      const batchInfluencers = enhancedInf.slice(batch, batch + 3)
      const isFirst = batch === 0

      slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-enh-inf .main-content { flex: 1; }
    .slide-enh-inf .inf-grid {
      display: grid;
      grid-template-columns: repeat(${Math.min(batchInfluencers.length, 3)}, 1fr);
      gap: 30px;
      margin-top: 40px;
    }
    .slide-enh-inf .inf-card {
      background: linear-gradient(145deg, var(--white) 0%, var(--light) 100%);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 30px 25px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .slide-enh-inf .inf-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(90deg, var(--accent), var(--accent-light));
    }
    .slide-enh-inf .inf-avatar {
      width: 90px; height: 90px; border-radius: 50%; margin: 0 auto 15px;
      background: var(--accent); display: flex; align-items: center; justify-content: center;
      color: white; font-size: 32px; font-weight: 700; overflow: hidden;
      border: 3px solid var(--accent); position: relative;
    }
    .slide-enh-inf .inf-avatar img {
      width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;
    }
    .slide-enh-inf .inf-name { font-size: 20px; font-weight: 700; color: var(--text); }
    .slide-enh-inf .inf-handle { font-size: 14px; color: var(--accent); margin-top: 2px; }
    .slide-enh-inf .inf-categories {
      display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 10px;
    }
    .slide-enh-inf .inf-cat {
      font-size: 11px; background: var(--light); color: var(--text-light);
      padding: 3px 10px; border-radius: 12px;
    }
    .slide-enh-inf .inf-stats {
      margin-top: 15px; background: var(--light); border-radius: 12px; padding: 12px;
    }
    .slide-enh-inf .inf-stat-row {
      display: flex; justify-content: space-between; padding: 5px 0;
      font-size: 14px; border-bottom: 1px solid var(--line);
    }
    .slide-enh-inf .inf-stat-row:last-child { border-bottom: none; }
    .slide-enh-inf .inf-stat-label { color: var(--muted); }
    .slide-enh-inf .inf-stat-val { font-weight: 600; color: var(--text); direction: ltr; unicode-bidi: isolate; }
    .slide-enh-inf .inf-demo {
      margin-top: 12px; padding: 10px; background: var(--white); border-radius: 10px;
      border: 1px solid var(--line);
    }
    .slide-enh-inf .inf-demo-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .slide-enh-inf .inf-bar-container { height: 8px; background: #eee; border-radius: 4px; overflow: hidden; }
    .slide-enh-inf .inf-bar { height: 100%; background: var(--accent); border-radius: 4px; }
  </style>
</head>
<body>
  <div class="slide slide-enh-inf">
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">${isFirst ? 'משפיענים מומלצים' : 'משפיענים מומלצים (המשך)'}</h1>

        <div class="inf-grid">
          ${batchInfluencers.map(inf => `
          <div class="inf-card">
            <div class="inf-avatar">
              <span>${inf.name.charAt(0)}</span>
              <img src="${inf.profilePicUrl || fallbackAvatar}" alt="${inf.name}" onerror="this.style.display='none'">
            </div>
            <div class="inf-name">${inf.name}${inf.isVerified ? ' &#10003;' : ''}</div>
            <div class="inf-handle">@${inf.username}</div>
            ${inf.categories?.length ? `
            <div class="inf-categories">
              ${inf.categories.slice(0, 3).map(c => `<span class="inf-cat">${c}</span>`).join('')}
            </div>` : ''}

            <div class="inf-stats">
              <div class="inf-stat-row">
                <span class="inf-stat-label">עוקבים</span>
                <span class="inf-stat-val">${formatNumber(inf.followers)}</span>
              </div>
              ${inf.avgStoryViews ? `
              <div class="inf-stat-row">
                <span class="inf-stat-label">צפיות סטורי</span>
                <span class="inf-stat-val">${formatNumber(inf.avgStoryViews)}</span>
              </div>` : ''}
              ${inf.avgReelViews ? `
              <div class="inf-stat-row">
                <span class="inf-stat-label">צפיות ריל</span>
                <span class="inf-stat-val">${formatNumber(inf.avgReelViews)}</span>
              </div>` : ''}
              <div class="inf-stat-row">
                <span class="inf-stat-label">מעורבות</span>
                <span class="inf-stat-val">${inf.engagementRate.toFixed(1)}%</span>
              </div>
              ${inf.israeliAudiencePercent ? `
              <div class="inf-stat-row">
                <span class="inf-stat-label">קהל ישראלי</span>
                <span class="inf-stat-val">${inf.israeliAudiencePercent}%</span>
              </div>` : ''}
            </div>

            ${inf.genderSplit ? `
            <div class="inf-demo">
              <div class="inf-demo-title">חלוקת מגדר</div>
              <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>נשים ${inf.genderSplit.female}%</span>
                <span>גברים ${inf.genderSplit.male}%</span>
              </div>
              <div class="inf-bar-container">
                <div class="inf-bar" style="width:${inf.genderSplit.female}%"></div>
              </div>
            </div>` : ''}
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
    }
  }

  // ========================================
  // SLIDE 14: TIMELINE (if available)
  // ========================================
  const timeline = data.influencerResearch?.suggestedTimeline || []
  if (timeline.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-timeline .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-timeline .timeline-container {
      display: flex;
      gap: 40px;
      margin-top: 60px;
      position: relative;
    }
    .slide-timeline .timeline-container::before {
      content: '';
      position: absolute;
      top: 60px;
      left: 100px;
      right: 100px;
      height: 4px;
      background: var(--line);
    }
    .slide-timeline .phase-card {
      flex: 1;
      background: var(--white);
      border: 2px solid var(--line);
      border-radius: 24px;
      padding: 40px;
      text-align: center;
      position: relative;
    }
    .slide-timeline .phase-number {
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 60px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
    }
    .slide-timeline .phase-title {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-top: 30px;
    }
    .slide-timeline .phase-duration {
      font-size: 18px;
      color: var(--accent);
      font-weight: 600;
      margin-top: 8px;
    }
    .slide-timeline .phase-activities {
      margin-top: 24px;
      text-align: right;
    }
    .slide-timeline .activity-item {
      font-size: 18px;
      color: var(--text-light);
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="slide slide-timeline">
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">לוח זמנים</h1>
        
        <div class="timeline-container">
          ${timeline.slice(0, 4).map((phase, i) => `
          <div class="phase-card">
            <div class="phase-number">${i + 1}</div>
            <div class="phase-title">${phase.phase}</div>
            <div class="phase-duration">${phase.duration}</div>
            <div class="phase-activities">
              ${phase.activities.slice(0, 3).map(a => `
              <div class="activity-item">• ${a}</div>
              `).join('')}
            </div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE 15: NEXT STEPS
  // ========================================
  if (data.nextSteps && data.nextSteps.length > 0) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-next-steps .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .slide-next-steps .steps-list {
      margin-top: 60px;
      max-width: 1000px;
    }
    .slide-next-steps .step-item {
      display: flex;
      align-items: flex-start;
      gap: 30px;
      padding: 40px 0;
      border-bottom: 1px solid var(--line);
    }
    .slide-next-steps .step-item:last-child {
      border-bottom: none;
    }
    .slide-next-steps .step-number {
      width: 60px;
      height: 60px;
      background: var(--accent);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .slide-next-steps .step-text {
      font-size: 28px;
      color: var(--text);
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="slide slide-next-steps">
    <div class="accent-shape corner-bottom-left"></div>
    <div class="slide-content">
      <div class="main-content">
        <h1 class="h1">השלבים הבאים</h1>
        
        <div class="steps-list">
          ${data.nextSteps.slice(0, 5).map((step, i) => `
          <div class="step-item">
            <div class="step-number">${i + 1}</div>
            <div class="step-text">${step}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)
  }

  // ========================================
  // SLIDE FINAL: CLOSING
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-closing {
      background: linear-gradient(135deg, var(--leaders-gray) 0%, ${secondary} 60%, ${primary} 100%);
      position: relative;
    }
    .slide-closing::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(ellipse at 50% 50%, ${primary}20 0%, transparent 70%);
    }
    .slide-closing .slide-content {
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .slide-closing .closing-headline {
      font-size: 72px;
      font-weight: 900;
      color: white;
      line-height: 1.2;
      margin-bottom: 60px;
      max-width: 1400px;
      text-wrap: balance;
    }
    .slide-closing .logo-footer img {
      filter: brightness(0) invert(1);
      opacity: 0.7;
    }
    .slide-closing .accent-line {
      width: 200px;
      height: 6px;
      background: var(--accent);
      margin: 0 auto 60px;
    }
  </style>
</head>
<body>
  <div class="slide slide-closing">
    <div class="slide-content">
      <div class="accent-line"></div>
      <h1 class="closing-headline">${data.closingHeadline || "LET'S CREATE"}</h1>
    </div>
    <div class="logo-footer">
      ${clientLogo ? `<img src="${clientLogo}" alt="Client">` : '<div></div>'}
      <img src="${leadersLogo}" alt="Leaders">
    </div>
  </div>
</body>
</html>
`)

  console.log(`[Premium Template] Generated ${slides.length} slides`)
  return slides
}

