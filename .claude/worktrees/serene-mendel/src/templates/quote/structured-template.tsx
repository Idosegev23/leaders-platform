// Template for structured chat data (flat format from quote-schema)

interface StructuredQuoteData {
  language?: string
  docTitle?: string
  clientName?: string
  contactPerson?: string
  issueDate?: string
  brandName?: string
  brandCategory?: string
  brandDescription?: string
  usp?: string
  toneOfVoice?: string[]
  brandLinks?: string[]
  goals?: string[]
  goalsFreeText?: string
  targetGender?: string
  targetAgeRange?: string
  targetBehavior?: string
  targetGeo?: string
  bigIdea?: string
  keyMessages?: string[]
  cta?: string
  hashtags?: string[]
  dos?: string[]
  donts?: string[]
  budget?: number
  currency?: string
  potentialEngagement?: number
  primaryInfluencers?: number
  distributionInfluencers?: number
  closingHeadline?: string
  contactDetails?: string
  [key: string]: unknown
}

interface TemplateConfig {
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  fonts: {
    heading: string
    body: string
    accent: string
  }
  logoUrl?: string
}

function getCurrency(data: StructuredQuoteData): string {
  if (data.currency?.includes('ILS') || data.currency?.includes('₪')) return '₪'
  if (data.currency?.includes('USD') || data.currency?.includes('$')) return '$'
  if (data.currency?.includes('EUR') || data.currency?.includes('€')) return '€'
  return '₪'
}

function filterSkipped(arr?: unknown): string[] {
  if (!arr || !Array.isArray(arr)) return []
  return arr.filter(v => v !== '__skipped__' && v !== undefined && v !== null && v !== '').map(String)
}

export function renderStructuredQuoteToHtml(data: StructuredQuoteData, config: TemplateConfig): string {
  const currency = getCurrency(data)
  const goals = filterSkipped(data.goals)
  const keyMessages = filterSkipped(data.keyMessages)
  const hashtags = filterSkipped(data.hashtags)
  const dos = filterSkipped(data.dos)
  const donts = filterSkipped(data.donts)
  const toneOfVoice = filterSkipped(data.toneOfVoice)
  
  return `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&family=Assistant:wght@400;500;600;700&family=Rubik:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: '${config.fonts.body}', 'Heebo', sans-serif;
      color: ${config.colors.text};
      background: ${config.colors.background};
      direction: rtl;
      line-height: 1.6;
    }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0;
      margin: 0 auto;
      background: white;
    }
    
    .cover {
      height: 100mm;
      background: linear-gradient(135deg, ${config.colors.primary} 0%, ${config.colors.secondary} 50%, ${config.colors.accent} 100%);
      color: white;
      padding: 30mm 20mm;
      position: relative;
      overflow: hidden;
    }
    
    .cover::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -20%;
      width: 300px;
      height: 300px;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
    }
    
    .cover::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -10%;
      width: 200px;
      height: 200px;
      background: rgba(255,255,255,0.05);
      border-radius: 50%;
    }
    
    .cover-content {
      position: relative;
      z-index: 1;
    }
    
    .cover h1 {
      font-family: '${config.fonts.heading}', 'Heebo', sans-serif;
      font-size: 32pt;
      font-weight: 800;
      margin-bottom: 10mm;
      line-height: 1.2;
    }
    
    .cover .brand-name {
      font-size: 18pt;
      opacity: 0.9;
      margin-bottom: 5mm;
    }
    
    .cover .client-name {
      font-size: 14pt;
      opacity: 0.7;
    }
    
    .content {
      padding: 15mm 20mm;
    }
    
    .section {
      margin-bottom: 12mm;
      page-break-inside: avoid;
    }
    
    .section-title {
      font-family: '${config.fonts.heading}', 'Heebo', sans-serif;
      font-size: 14pt;
      font-weight: 700;
      color: ${config.colors.primary};
      margin-bottom: 5mm;
      padding-bottom: 2mm;
      border-bottom: 2px solid ${config.colors.accent};
      display: flex;
      align-items: center;
      gap: 3mm;
    }
    
    .section-content {
      font-size: 11pt;
      color: #444;
    }
    
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 2mm;
      margin-top: 3mm;
    }
    
    .tag {
      display: inline-block;
      padding: 1.5mm 4mm;
      background: linear-gradient(135deg, ${config.colors.primary}15, ${config.colors.accent}15);
      color: ${config.colors.primary};
      border-radius: 20px;
      font-size: 10pt;
      font-weight: 500;
    }
    
    .message-list {
      list-style: none;
    }
    
    .message-list li {
      padding: 2mm 0;
      padding-right: 5mm;
      position: relative;
    }
    
    .message-list li::before {
      content: '•';
      position: absolute;
      right: 0;
      color: ${config.colors.accent};
      font-weight: bold;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 5mm;
      margin-top: 5mm;
    }
    
    .stat-box {
      text-align: center;
      padding: 5mm;
      background: linear-gradient(135deg, ${config.colors.primary}08, ${config.colors.accent}08);
      border-radius: 3mm;
      border: 1px solid ${config.colors.primary}20;
    }
    
    .stat-label {
      font-size: 9pt;
      color: #666;
      margin-bottom: 2mm;
    }
    
    .stat-value {
      font-family: '${config.fonts.heading}', 'Heebo', sans-serif;
      font-size: 18pt;
      font-weight: 700;
      color: ${config.colors.accent};
    }
    
    .two-columns {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5mm;
    }
    
    .do-box, .dont-box {
      padding: 4mm;
      border-radius: 3mm;
    }
    
    .do-box {
      background: #e8f5e9;
      border: 1px solid #4caf50;
    }
    
    .dont-box {
      background: #ffebee;
      border: 1px solid #f44336;
    }
    
    .do-box h4 {
      color: #2e7d32;
      margin-bottom: 3mm;
    }
    
    .dont-box h4 {
      color: #c62828;
      margin-bottom: 3mm;
    }
    
    .do-box ul, .dont-box ul {
      list-style: none;
      font-size: 10pt;
    }
    
    .do-box li::before {
      content: '✓ ';
      color: #4caf50;
    }
    
    .dont-box li::before {
      content: '✗ ';
      color: #f44336;
    }
    
    .footer {
      margin-top: 15mm;
      padding-top: 8mm;
      border-top: 2px solid ${config.colors.primary}20;
      text-align: center;
    }
    
    .footer h3 {
      font-family: '${config.fonts.accent}', 'Rubik', sans-serif;
      font-size: 20pt;
      color: ${config.colors.accent};
      margin-bottom: 5mm;
    }
    
    .footer p {
      font-size: 10pt;
      color: #666;
      white-space: pre-line;
    }
    
    @media print {
      .page {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Cover Section -->
    <div class="cover">
      <div class="cover-content">
        <h1>${data.docTitle || 'הצעת קמפיין משפיענים'}</h1>
        ${data.brandName ? `<div class="brand-name">עבור ${data.brandName}</div>` : ''}
        ${data.clientName ? `<div class="client-name">לכבוד: ${data.clientName}${data.contactPerson ? ` | ${data.contactPerson}` : ''}</div>` : ''}
      </div>
    </div>
    
    <!-- Content -->
    <div class="content">
      <!-- About Brand -->
      ${data.brandDescription ? `
      <div class="section">
        <div class="section-title">🏷️ על המותג</div>
        <div class="section-content">
          <p>${data.brandDescription}</p>
          ${data.usp ? `<p style="margin-top: 3mm; font-weight: 600;">USP: ${data.usp}</p>` : ''}
          ${toneOfVoice.length > 0 ? `
          <div class="tag-list">
            ${toneOfVoice.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}
      
      <!-- Goals -->
      ${goals.length > 0 ? `
      <div class="section">
        <div class="section-title">🎯 מטרות הקמפיין</div>
        <div class="section-content">
          <div class="tag-list">
            ${goals.map(g => `<span class="tag">${g}</span>`).join('')}
          </div>
          ${data.goalsFreeText ? `<p style="margin-top: 4mm;">${data.goalsFreeText}</p>` : ''}
        </div>
      </div>
      ` : ''}
      
      <!-- Target Audience -->
      ${(data.targetGender || data.targetAgeRange || data.targetGeo) ? `
      <div class="section">
        <div class="section-title">👥 קהל יעד</div>
        <div class="section-content">
          <div class="tag-list">
            ${data.targetGender ? `<span class="tag">${data.targetGender}</span>` : ''}
            ${data.targetAgeRange ? `<span class="tag">גילאי ${data.targetAgeRange}</span>` : ''}
            ${data.targetGeo ? `<span class="tag">${data.targetGeo}</span>` : ''}
          </div>
          ${data.targetBehavior ? `<p style="margin-top: 4mm;">${data.targetBehavior}</p>` : ''}
        </div>
      </div>
      ` : ''}
      
      <!-- Big Idea -->
      ${data.bigIdea ? `
      <div class="section">
        <div class="section-title">💡 הרעיון המרכזי</div>
        <div class="section-content">
          <p style="font-size: 12pt; font-weight: 500;">${data.bigIdea}</p>
        </div>
      </div>
      ` : ''}
      
      <!-- Key Messages -->
      ${keyMessages.length > 0 ? `
      <div class="section">
        <div class="section-title">📝 מסרים עיקריים</div>
        <div class="section-content">
          <ul class="message-list">
            ${keyMessages.map(m => `<li>${m}</li>`).join('')}
          </ul>
        </div>
      </div>
      ` : ''}
      
      <!-- CTA -->
      ${data.cta ? `
      <div class="section">
        <div class="section-title">🎬 CTA</div>
        <div class="section-content">
          <p style="font-weight: 600; font-size: 12pt;">${data.cta}</p>
          ${hashtags.length > 0 ? `
          <div class="tag-list" style="margin-top: 3mm;">
            ${hashtags.map(h => `<span class="tag">${h}</span>`).join('')}
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}
      
      <!-- Do's and Don'ts -->
      ${(dos.length > 0 || donts.length > 0) ? `
      <div class="section">
        <div class="section-title">📋 הנחיות</div>
        <div class="two-columns">
          ${dos.length > 0 ? `
          <div class="do-box">
            <h4>✓ Do's</h4>
            <ul>
              ${dos.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
          ` : '<div></div>'}
          ${donts.length > 0 ? `
          <div class="dont-box">
            <h4>✗ Don'ts</h4>
            <ul>
              ${donts.map(d => `<li>${d}</li>`).join('')}
            </ul>
          </div>
          ` : '<div></div>'}
        </div>
      </div>
      ` : ''}
      
      <!-- Stats -->
      ${(data.budget || data.potentialEngagement || data.primaryInfluencers) ? `
      <div class="section">
        <div class="section-title">📊 מספרים</div>
        <div class="stats-grid">
          ${data.budget ? `
          <div class="stat-box">
            <div class="stat-label">תקציב</div>
            <div class="stat-value">${currency}${data.budget.toLocaleString()}</div>
          </div>
          ` : ''}
          ${data.potentialEngagement ? `
          <div class="stat-box">
            <div class="stat-label">Potential Engagement</div>
            <div class="stat-value">${data.potentialEngagement.toLocaleString()}</div>
          </div>
          ` : ''}
          ${(data.primaryInfluencers || data.distributionInfluencers) ? `
          <div class="stat-box">
            <div class="stat-label">משפיענים</div>
            <div class="stat-value">${(data.primaryInfluencers || 0) + (data.distributionInfluencers || 0)}</div>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}
      
      <!-- Footer -->
      <div class="footer">
        <h3>${data.closingHeadline || "LET'S GET STARTED"}</h3>
        ${data.contactDetails ? `<p>${data.contactDetails}</p>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
`
}

