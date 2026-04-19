/**
 * Proposal Template - "הצעת מחיר רזה"
 * Premium Minimalist Design
 * Canvas: 16:9 (1920x1080)
 * 
 * Design Principles:
 * - Lots of white space
 * - Single accent color
 * - Max 6 elements per slide
 * - Max 2 text sizes per area
 * - No colorful gradients
 */

interface ProposalData {
  // Meta / Cover
  brandName?: string
  issueDate?: string
  brandLogoFile?: string
  coverImage?: string
  
  // Goals & Audience
  goals?: string[]
  targetGender?: string
  targetAgeRange?: string
  targetBehavior?: string
  
  // Brand
  brandDescription?: string
  brandImage?: string
  
  // Activity
  activityDescription?: string
  
  // Deliverables
  deliverables?: string[]
  
  // Targets
  budget?: number
  currency?: string
  potentialEngagement?: number
  primaryInfluencers?: number
  distributionInfluencers?: number
  
  // Influencers
  influencerCount?: number
  influencerData?: {
    name: string
    imageUrl?: string
    followers: number
    avgLikes?: number
    avgComments?: number
    engagementRate?: number
  }[]
  influencerImages?: string[] // Legacy support
  influencerNote?: string
  
  // Closing
  closingHeadline?: string
  
  [key: string]: unknown
}

interface TemplateConfig {
  accentColor?: string
  brandLogoUrl?: string
  leadersLogoUrl?: string
  images?: {
    brandImage?: string
    audienceImage?: string
  }
}

// Helper functions
function clean(arr?: unknown): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.filter(v => v && v !== '__skipped__' && v !== '').map(String)
}

function getCurrency(data: ProposalData): string {
  if (data.currency?.includes('ILS') || data.currency?.includes('₪')) return '₪'
  if (data.currency?.includes('USD') || data.currency?.includes('$')) return '$'
  if (data.currency?.includes('EUR') || data.currency?.includes('€')) return '€'
  return '₪'
}

function formatNumber(num?: number): string {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(0) + 'K'
  return num.toLocaleString()
}

function formatHebrewDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    return `${day}.${month}.${year}`
  } catch {
    return dateStr
  }
}

export function renderProposalToHtml(data: ProposalData, config: TemplateConfig = {}): string[] {
  const accent = config.accentColor || '#111111'
  const currency = getCurrency(data)
  const goals = clean(data.goals)
  const deliverables = clean(data.deliverables)
  
  // Logo URLs
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const defaultLeadersLogo = `${supabaseUrl}/storage/v1/object/public/assets/logos/leaders-logo-black.png`
  const leadersLogo = config.leadersLogoUrl || defaultLeadersLogo
  
  // Generated images (from Gemini or data)
  const brandImage = config.images?.brandImage || data.brandImage
  const audienceImage = config.images?.audienceImage
  const coverImage = data.coverImage || brandImage // Use brand image as cover if no cover

  // Base styles - Minimalist Premium
  const baseStyles = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap');
      
      :root {
        --w: 1920px;
        --h: 1080px;
        --px: 120px;
        --py: 80px;
        
        --bg: #ebecec; /* Gray base background */
        --bg-card: #ffffff;
        --text: #111111;
        --muted: #6b7280;
        --light: #e0e1e1;
        --accent: ${accent};
        
        --h1: 72px;
        --h2: 48px;
        --body: 32px;
        --small: 22px;
      }
      
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Heebo', sans-serif;
        background: var(--bg);
        color: var(--text);
        direction: rtl;
        font-weight: 400;
      }
      
      .slide {
        width: var(--w);
        height: var(--h);
        position: relative;
        overflow: hidden;
        background: var(--bg);
        page-break-after: always;
      }
      
      .slide-content {
        padding: var(--py) var(--px);
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      
      .logo-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 60px;
      }
      
      .logo-header img {
        height: 48px;
        object-fit: contain;
      }
      
      /* Brand logo with dark background for white logos */
      .logo-header .brand-logo-container {
        background: rgba(0, 0, 0, 0.8);
        padding: 8px 16px;
        border-radius: 8px;
      }
      
      .logo-header .brand-logo-container img {
        height: 32px;
      }
      
      .h1 {
        font-size: var(--h1);
        font-weight: 700;
        color: var(--text);
        line-height: 1.2;
        margin-bottom: 48px;
      }
      
      .h2 {
        font-size: var(--h2);
        font-weight: 600;
        color: var(--text);
        line-height: 1.3;
      }
      
      .body {
        font-size: var(--body);
        font-weight: 400;
        color: var(--muted);
        line-height: 1.6;
      }
      
      .small {
        font-size: var(--small);
        font-weight: 500;
        color: var(--muted);
      }
      
      @media print {
        .slide {
          page-break-after: always;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>
  `

  const slides: string[] = []

  // ========================================
  // SLIDE 1: COVER
  // Full bleed image, subtle overlay, small logos
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-cover {
      background: ${coverImage ? `url('${coverImage}')` : 'var(--light)'};
      background-size: cover;
      background-position: center;
      position: relative;
    }
    
    .slide-cover::before {
      content: '';
      position: absolute;
      inset: 0;
      background: ${coverImage ? 'rgba(0,0,0,0.35)' : 'transparent'};
    }
    
    .slide-cover .content {
      position: relative;
      z-index: 1;
      height: 100%;
      padding: var(--py) var(--px);
      display: flex;
      flex-direction: column;
    }
    
    .slide-cover .logos {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .slide-cover .logos img {
      height: 40px;
      object-fit: contain;
      ${coverImage ? 'filter: brightness(0) invert(1);' : ''}
    }
    
    .slide-cover .center {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    
    .slide-cover .brand-name {
      font-size: 120px;
      font-weight: 800;
      color: ${coverImage ? 'white' : 'var(--text)'};
      letter-spacing: -0.02em;
      line-height: 1;
    }
    
    .slide-cover .date {
      font-size: var(--small);
      color: ${coverImage ? 'rgba(255,255,255,0.7)' : 'var(--muted)'};
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="slide slide-cover">
    <div class="content">
      <div class="logos">
        ${config.brandLogoUrl ? `<div class="brand-logo-container"><img src="${config.brandLogoUrl}" alt="Brand"></div>` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="center">
        <div class="brand-name">${data.brandName || ''}</div>
        ${data.issueDate ? `<div class="date">${formatHebrewDate(data.issueDate)}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `)

  // ========================================
  // SLIDE 2: GOALS & AUDIENCE
  // White background, big bullets, audience box
  // ========================================
  if (goals.length > 0 || data.targetGender || data.targetAgeRange) {
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
      gap: 80px;
    }
    
    .slide-goals .goals-section {
      flex: 1;
    }
    
    .slide-goals .goals-list {
      list-style: none;
      margin-top: 40px;
    }
    
    .slide-goals .goals-list li {
      font-size: 42px;
      font-weight: 500;
      color: var(--text);
      padding: 24px 0;
      padding-right: 48px;
      position: relative;
      border-bottom: 1px solid var(--light);
    }
    
    .slide-goals .goals-list li:last-child {
      border-bottom: none;
    }
    
    .slide-goals .goals-list li::before {
      content: '';
      position: absolute;
      right: 0;
      top: 36px;
      width: 16px;
      height: 16px;
      background: var(--accent);
      border-radius: 50%;
    }
    
    .slide-goals .audience-section {
      width: 500px;
      flex-shrink: 0;
    }
    
    .slide-goals .audience-box {
      background: var(--bg-card);
      padding: 48px;
      border-radius: 24px;
      margin-top: 40px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    
    .slide-goals .audience-box .label {
      font-size: var(--small);
      color: var(--muted);
      margin-bottom: 8px;
    }
    
    .slide-goals .audience-box .value {
      font-size: 36px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 24px;
    }
    
    .slide-goals .audience-box .value:last-child {
      margin-bottom: 0;
    }
    
    .slide-goals .behavior {
      font-size: 28px;
      color: var(--muted);
      margin-top: 16px;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="slide slide-goals">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <div class="goals-section">
          <h1 class="h1">מטרות הקמפיין</h1>
          <ul class="goals-list">
            ${goals.slice(0, 5).map(g => `<li>${g}</li>`).join('')}
          </ul>
        </div>
        
        <div class="audience-section">
          <h2 class="h2">קהל יעד</h2>
          <div class="audience-box">
            ${data.targetGender ? `
            <div class="label">מגדר</div>
            <div class="value">${data.targetGender}</div>
            ` : ''}
            ${data.targetAgeRange ? `
            <div class="label">גילאים</div>
            <div class="value">${data.targetAgeRange}</div>
            ` : ''}
            ${data.targetBehavior ? `
            <div class="behavior">${data.targetBehavior}</div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 3: ABOUT THE BRAND
  // Image on side, single paragraph
  // ========================================
  if (data.brandDescription) {
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-brand {
      display: flex;
    }
    
    .slide-brand .text-section {
      flex: 1;
      padding: var(--py) var(--px);
      display: flex;
      flex-direction: column;
    }
    
    .slide-brand .text-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      max-width: 800px;
    }
    
    .slide-brand .description {
      font-size: 36px;
      font-weight: 400;
      color: var(--text);
      line-height: 1.7;
    }
    
    .slide-brand .image-section {
      width: 45%;
      background: ${brandImage ? `url('${brandImage}')` : 'var(--light)'};
      background-size: cover;
      background-position: center;
    }
  </style>
</head>
<body>
  <div class="slide slide-brand">
    <div class="text-section">
      <div class="logo-header">
        ${config.brandLogoUrl ? `<div class="brand-logo-container"><img src="${config.brandLogoUrl}" alt="Brand"></div>` : '<div></div>'}
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="text-content">
        <h1 class="h1">על המותג</h1>
        <p class="description">${data.brandDescription}</p>
      </div>
    </div>
    
    <div class="image-section"></div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 4: ACTIVITY
  // Clean text, simple bullets
  // ========================================
  if (data.activityDescription) {
    // Split description into bullet points by line or period
    const activityLines = data.activityDescription
      .split(/[.\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .slice(0, 4)

    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-activity .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      max-width: 1200px;
    }
    
    .slide-activity .activity-list {
      list-style: none;
      margin-top: 48px;
    }
    
    .slide-activity .activity-list li {
      font-size: 38px;
      font-weight: 400;
      color: var(--text);
      padding: 28px 0;
      padding-right: 56px;
      position: relative;
      line-height: 1.5;
    }
    
    .slide-activity .activity-list li::before {
      content: '';
      position: absolute;
      right: 0;
      top: 40px;
      width: 20px;
      height: 3px;
      background: var(--accent);
    }
  </style>
</head>
<body>
  <div class="slide slide-activity">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">הפעילות</h1>
        <ul class="activity-list">
          ${activityLines.map(line => `<li>${line}</li>`).join('')}
        </ul>
      </div>
    </div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 5: DELIVERABLES
  // Visual list, clear numbers
  // ========================================
  if (deliverables.length > 0) {
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
      grid-template-columns: repeat(3, 1fr);
      gap: 40px;
      margin-top: 60px;
    }
    
    .slide-deliverables .deliverable-item {
      background: var(--bg-card);
      padding: 48px;
      border-radius: 24px;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    
    .slide-deliverables .deliverable-item .text {
      font-size: 36px;
      font-weight: 600;
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="slide slide-deliverables">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">תוצרים</h1>
        <div class="deliverables-grid">
          ${deliverables.slice(0, 6).map(d => `
          <div class="deliverable-item">
            <div class="text">${d}</div>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 6: TARGETS & BUDGET
  // Big numbers, clean grid
  // ========================================
  if (data.budget || data.potentialEngagement || data.primaryInfluencers) {
    const totalInfluencers = (data.primaryInfluencers || 0) + (data.distributionInfluencers || 0)
    const cpe = data.budget && data.potentialEngagement 
      ? (data.budget / data.potentialEngagement).toFixed(2)
      : null
    
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-targets .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    
    .slide-targets .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 60px;
      margin-top: 60px;
    }
    
    .slide-targets .stat-item {
      text-align: center;
      padding: 60px;
      background: var(--bg-card);
      border-radius: 32px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    
    .slide-targets .stat-value {
      font-size: 96px;
      font-weight: 800;
      color: var(--text);
      line-height: 1;
      margin-bottom: 16px;
    }
    
    .slide-targets .stat-label {
      font-size: 28px;
      font-weight: 500;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .slide-targets .stat-detail {
      font-size: 22px;
      color: var(--muted);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="slide slide-targets">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">יעדים ותקציב</h1>
        <div class="stats-grid">
          ${data.budget ? `
          <div class="stat-item">
            <div class="stat-value">${currency}${formatNumber(data.budget)}</div>
            <div class="stat-label">תקציב</div>
          </div>
          ` : ''}
          
          ${data.potentialEngagement ? `
          <div class="stat-item">
            <div class="stat-value">${formatNumber(data.potentialEngagement)}</div>
            <div class="stat-label">Potential Engagement</div>
          </div>
          ` : ''}
          
          ${totalInfluencers > 0 ? `
          <div class="stat-item">
            <div class="stat-value">${totalInfluencers}</div>
            <div class="stat-label">משפיענים</div>
            ${data.primaryInfluencers && data.distributionInfluencers ? `
            <div class="stat-detail">${data.primaryInfluencers} מרכזיים + ${data.distributionInfluencers} הפצה</div>
            ` : ''}
          </div>
          ` : ''}
          
          ${cpe ? `
          <div class="stat-item">
            <div class="stat-value">${currency}${cpe}</div>
            <div class="stat-label">CPE</div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 7: INFLUENCERS - VISUAL
  // Photos with names, visual focus
  // ========================================
  const influencers = data.influencerData || []
  const influencerImages = clean(data.influencerImages) // Legacy support
  
  if (influencers.length > 0) {
    // New format with structured data
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-influencers-visual .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .slide-influencers-visual .influencers-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(${Math.min(influencers.length, 3)}, 1fr);
      gap: 32px;
      margin-top: 48px;
      align-items: start;
    }
    
    .slide-influencers-visual .influencer-card {
      text-align: center;
    }
    
    .slide-influencers-visual .influencer-image {
      width: 200px;
      height: 200px;
      border-radius: 50%;
      overflow: hidden;
      margin: 0 auto 24px;
      background: var(--light);
      border: 4px solid white;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }
    
    .slide-influencers-visual .influencer-image img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .slide-influencers-visual .influencer-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 64px;
      color: var(--muted);
    }
    
    .slide-influencers-visual .influencer-name {
      font-size: 28px;
      font-weight: 700;
      color: var(--text);
      margin-bottom: 8px;
    }
    
    .slide-influencers-visual .influencer-followers {
      font-size: 20px;
      color: ${accent};
      font-weight: 600;
    }
    
    .slide-influencers-visual .note {
      text-align: center;
      font-size: var(--small);
      color: var(--muted);
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="slide slide-influencers-visual">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">משפיענים</h1>
        <div class="influencers-grid">
          ${influencers.slice(0, 6).map(inf => `
          <div class="influencer-card">
            <div class="influencer-image">
              ${inf.imageUrl 
                ? `<img src="${inf.imageUrl}" alt="${inf.name}">`
                : `<div class="influencer-placeholder">👤</div>`
              }
            </div>
            <div class="influencer-name">${inf.name}</div>
            <div class="influencer-followers">${formatNumber(inf.followers)} עוקבים</div>
          </div>
          `).join('')}
        </div>
        ${data.influencerNote ? `<div class="note">${data.influencerNote}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
    `)
    
    // ========================================
    // SLIDE 8: INFLUENCERS - DATA TABLE
    // Clean table with engagement metrics
    // ========================================
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-influencers-data .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .slide-influencers-data .data-table {
      width: 100%;
      margin-top: 48px;
      border-collapse: collapse;
    }
    
    .slide-influencers-data .data-table th {
      text-align: right;
      padding: 20px 24px;
      font-size: 18px;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 2px solid var(--line);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .slide-influencers-data .data-table td {
      padding: 24px;
      font-size: 22px;
      border-bottom: 1px solid var(--line);
    }
    
    .slide-influencers-data .data-table tr:last-child td {
      border-bottom: none;
    }
    
    .slide-influencers-data .influencer-cell {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    
    .slide-influencers-data .influencer-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      overflow: hidden;
      background: var(--light);
    }
    
    .slide-influencers-data .influencer-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .slide-influencers-data .influencer-name {
      font-weight: 600;
    }
    
    .slide-influencers-data .metric {
      font-weight: 600;
      color: var(--text);
    }
    
    .slide-influencers-data .metric.highlight {
      color: ${accent};
    }
    
    .slide-influencers-data .note {
      text-align: center;
      font-size: var(--small);
      color: var(--muted);
      margin-top: 32px;
    }
  </style>
</head>
<body>
  <div class="slide slide-influencers-data">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">נתוני משפיענים</h1>
        <table class="data-table">
          <thead>
            <tr>
              <th>משפיען</th>
              <th>עוקבים</th>
              <th>ממוצע לייקים</th>
              <th>ממוצע תגובות</th>
              <th>מעורבות</th>
            </tr>
          </thead>
          <tbody>
            ${influencers.map(inf => `
            <tr>
              <td>
                <div class="influencer-cell">
                  <div class="influencer-avatar">
                    ${inf.imageUrl 
                      ? `<img src="${inf.imageUrl}" alt="${inf.name}">`
                      : ''
                    }
                  </div>
                  <span class="influencer-name">${inf.name}</span>
                </div>
              </td>
              <td class="metric">${formatNumber(inf.followers)}</td>
              <td class="metric">${inf.avgLikes ? formatNumber(inf.avgLikes) : '-'}</td>
              <td class="metric">${inf.avgComments ? formatNumber(inf.avgComments) : '-'}</td>
              <td class="metric highlight">${inf.engagementRate ? inf.engagementRate.toFixed(1) + '%' : '-'}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
        ${data.influencerNote ? `<div class="note">${data.influencerNote}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
    `)
  } else if (influencerImages.length > 0) {
    // Legacy format with just images
    slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-influencers-visual .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .slide-influencers-visual .images-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 24px;
      margin-top: 40px;
    }
    
    .slide-influencers-visual .image-item {
      border-radius: 20px;
      overflow: hidden;
      background: var(--light);
    }
    
    .slide-influencers-visual .image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .slide-influencers-visual .note {
      text-align: center;
      font-size: var(--small);
      color: var(--muted);
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="slide slide-influencers-visual">
    <div class="slide-content">
      <div class="logo-header">
        <div></div>
        <img src="${leadersLogo}" alt="Leaders">
      </div>
      
      <div class="main-content">
        <h1 class="h1">משפיענים</h1>
        <div class="images-grid">
          ${influencerImages.slice(0, 6).map(img => `
          <div class="image-item">
            <img src="${img}" alt="Influencer">
          </div>
          `).join('')}
        </div>
        ${data.influencerNote ? `<div class="note">${data.influencerNote}</div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
    `)
  }

  // ========================================
  // SLIDE 9: CLOSING
  // White, single sentence centered
  // ========================================
  slides.push(`
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  ${baseStyles}
  <style>
    .slide-closing {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .slide-closing .content {
      text-align: center;
    }
    
    .slide-closing .headline {
      font-size: 96px;
      font-weight: 800;
      color: var(--text);
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    
    .slide-closing .logo {
      margin-top: 80px;
    }
    
    .slide-closing .logo img {
      height: 56px;
    }
  </style>
</head>
<body>
  <div class="slide slide-closing">
    <div class="content">
      <div class="headline">${data.closingHeadline || "LET'S GET STARTED"}</div>
      <div class="logo">
        <img src="${leadersLogo}" alt="Leaders">
      </div>
    </div>
  </div>
</body>
</html>
  `)

  return slides
}

// Single page version for PDF
export function renderProposalSinglePage(data: ProposalData, config: TemplateConfig = {}): string {
  const slides = renderProposalToHtml(data, config)
  return slides.join('\n')
}
