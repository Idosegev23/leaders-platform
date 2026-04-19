/**
 * Research Report PDF Template
 * Generates self-contained HTML for converting to PDF via Puppeteer
 */

interface ResearchPdfData {
  brandName: string
  brandResearch: {
    companyDescription?: string
    industry?: string
    competitors?: { name: string; description: string; differentiator: string }[]
    mainProducts?: { name: string; description: string }[]
    targetDemographics?: {
      primaryAudience?: {
        gender?: string; ageRange?: string; lifestyle?: string
        interests?: string[]; painPoints?: string[]
      }
    }
    socialPresence?: Record<string, { handle?: string; followers?: string; engagement?: string }>
    brandPersonality?: string[]
    brandValues?: string[]
    suggestedApproach?: string
    industryTrends?: string[]
    sources?: { title: string; url: string }[]
  } | null
  influencerStrategy: {
    strategyTitle?: string
    strategySummary?: string
    tiers?: { name: string; description: string; recommendedCount: number; budgetAllocation: string }[]
    recommendations?: {
      name: string; handle: string; category: string; followers: string
      engagement: string; whyRelevant: string
    }[]
    contentThemes?: { theme: string; description: string }[]
    expectedKPIs?: { metric: string; target: string; rationale: string }[]
  } | null
  brandColors: {
    primary?: string; secondary?: string; accent?: string
  } | null
}

export function generateResearchHtml(data: ResearchPdfData): string {
  const { brandName, brandResearch: br, influencerStrategy: is, brandColors } = data
  const primary = brandColors?.primary || '#2563eb'
  const date = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Heebo', sans-serif;
    direction: rtl;
    color: #1a1a2e;
    background: #fff;
    font-size: 11pt;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 20mm 25mm;
    page-break-after: always;
    position: relative;
  }
  .page:last-child { page-break-after: auto; }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 3px solid ${primary};
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .header h1 {
    font-size: 22pt;
    font-weight: 800;
    color: ${primary};
  }
  .header .meta {
    text-align: left;
    font-size: 9pt;
    color: #666;
  }
  .header .logo {
    font-size: 10pt;
    font-weight: 700;
    color: #333;
    letter-spacing: 1px;
  }

  /* Sections */
  .section { margin-bottom: 20px; }
  .section-title {
    font-size: 14pt;
    font-weight: 700;
    color: ${primary};
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e5e7eb;
  }

  /* Content elements */
  p { margin-bottom: 8px; }
  .badge {
    display: inline-block;
    background: ${primary}15;
    color: ${primary};
    font-size: 9pt;
    padding: 2px 10px;
    border-radius: 12px;
    margin: 2px 0 2px 6px;
    font-weight: 500;
  }
  .badge-outline {
    display: inline-block;
    border: 1px solid #d1d5db;
    color: #374151;
    font-size: 9pt;
    padding: 2px 10px;
    border-radius: 12px;
    margin: 2px 0 2px 6px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
  }
  th, td {
    text-align: right;
    padding: 8px 10px;
    font-size: 10pt;
    border-bottom: 1px solid #e5e7eb;
  }
  th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }
  tr:last-child td { border-bottom: none; }

  /* Cards */
  .card-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 12px;
  }
  .card-title {
    font-weight: 600;
    font-size: 10pt;
    margin-bottom: 4px;
  }
  .card-text {
    font-size: 9pt;
    color: #6b7280;
  }

  /* KPI boxes */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .kpi-box {
    text-align: center;
    background: ${primary}08;
    border: 1px solid ${primary}20;
    border-radius: 8px;
    padding: 10px;
  }
  .kpi-label { font-size: 9pt; color: #6b7280; }
  .kpi-value { font-size: 14pt; font-weight: 800; color: ${primary}; direction: ltr; }

  /* Footer */
  .footer {
    position: absolute;
    bottom: 15mm;
    left: 25mm;
    right: 25mm;
    text-align: center;
    font-size: 8pt;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
    padding-top: 8px;
  }
  .footer .leaders { font-weight: 700; color: #374151; }
</style>
</head>
<body>

<!-- Page 1: Brand Overview -->
<div class="page">
  <div class="header">
    <div>
      <h1>מחקר מותג: ${esc(brandName)}</h1>
    </div>
    <div class="meta">
      <div class="logo">LEADERS</div>
      <div>${date}</div>
    </div>
  </div>

  ${br ? `
  <div class="section">
    <div class="section-title">סקירת מותג</div>
    ${br.industry ? `<p><strong>תעשייה:</strong> ${esc(br.industry)}</p>` : ''}
    ${br.companyDescription ? `<p>${esc(br.companyDescription)}</p>` : ''}
    ${br.brandPersonality?.length ? `
      <p><strong>אישיות המותג:</strong></p>
      <p>${br.brandPersonality.map(p => `<span class="badge">${esc(p)}</span>`).join(' ')}</p>
    ` : ''}
    ${br.brandValues?.length ? `
      <p><strong>ערכי המותג:</strong></p>
      <p>${br.brandValues.map(v => `<span class="badge-outline">${esc(v)}</span>`).join(' ')}</p>
    ` : ''}
  </div>

  ${br.competitors?.length ? `
  <div class="section">
    <div class="section-title">שוק ומתחרים</div>
    <table>
      <thead><tr><th>שם</th><th>תיאור</th><th>מבדל</th></tr></thead>
      <tbody>
        ${br.competitors.map(c => `
          <tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.description)}</td><td>${esc(c.differentiator)}</td></tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${br.targetDemographics?.primaryAudience ? `
  <div class="section">
    <div class="section-title">קהל יעד</div>
    <div class="card-grid">
      ${br.targetDemographics.primaryAudience.gender ? `<div class="card"><div class="card-title">מגדר</div><div class="card-text">${esc(br.targetDemographics.primaryAudience.gender)}</div></div>` : ''}
      ${br.targetDemographics.primaryAudience.ageRange ? `<div class="card"><div class="card-title">טווח גילאים</div><div class="card-text">${esc(br.targetDemographics.primaryAudience.ageRange)}</div></div>` : ''}
    </div>
    ${br.targetDemographics.primaryAudience.interests?.length ? `
      <p style="margin-top:8px"><strong>תחומי עניין:</strong></p>
      <p>${br.targetDemographics.primaryAudience.interests.map(i => `<span class="badge">${esc(i)}</span>`).join(' ')}</p>
    ` : ''}
    ${br.targetDemographics.primaryAudience.painPoints?.length ? `
      <p><strong>נקודות כאב:</strong></p>
      <p>${br.targetDemographics.primaryAudience.painPoints.map(p => `<span class="badge-outline">${esc(p)}</span>`).join(' ')}</p>
    ` : ''}
  </div>
  ` : ''}
  ` : '<p>לא נמצא מחקר מותג</p>'}

  <div class="footer">
    <span class="leaders">LEADERS</span> — מסמך מחקר שנוצר אוטומטית
  </div>
</div>

<!-- Page 2: Influencer Strategy -->
${is ? `
<div class="page">
  <div class="header">
    <h1 style="font-size:18pt">אסטרטגיית משפיענים</h1>
    <div class="meta">
      <div class="logo">LEADERS</div>
      <div>${esc(brandName)}</div>
    </div>
  </div>

  ${is.strategySummary ? `
  <div class="section">
    <div class="section-title">סיכום אסטרטגיה</div>
    <p>${esc(is.strategySummary)}</p>
  </div>
  ` : ''}

  ${is.tiers?.length ? `
  <div class="section">
    <div class="section-title">חלוקת טירים</div>
    <table>
      <thead><tr><th>טיר</th><th>תיאור</th><th>כמות</th><th>תקציב</th></tr></thead>
      <tbody>
        ${is.tiers.map(t => `
          <tr><td><strong>${esc(t.name)}</strong></td><td>${esc(t.description)}</td><td>${t.recommendedCount}</td><td>${esc(t.budgetAllocation)}</td></tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${is.recommendations?.length ? `
  <div class="section">
    <div class="section-title">משפיענים מומלצים</div>
    <table>
      <thead><tr><th>שם</th><th>Handle</th><th>קטגוריה</th><th>עוקבים</th><th>מעורבות</th></tr></thead>
      <tbody>
        ${is.recommendations.map(r => `
          <tr>
            <td><strong>${esc(r.name)}</strong></td>
            <td dir="ltr">${esc(r.handle)}</td>
            <td>${esc(r.category)}</td>
            <td dir="ltr">${esc(r.followers)}</td>
            <td dir="ltr">${esc(r.engagement)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${is.expectedKPIs?.length ? `
  <div class="section">
    <div class="section-title">יעדי KPI</div>
    <div class="kpi-grid">
      ${is.expectedKPIs.map(k => `
        <div class="kpi-box">
          <div class="kpi-label">${esc(k.metric)}</div>
          <div class="kpi-value">${esc(k.target)}</div>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  ${is.contentThemes?.length ? `
  <div class="section">
    <div class="section-title">ערוצי תוכן</div>
    ${is.contentThemes.map(t => `
      <div class="card" style="margin-bottom:6px">
        <div class="card-title">${esc(t.theme)}</div>
        <div class="card-text">${esc(t.description)}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  ${br?.suggestedApproach ? `
  <div class="section">
    <div class="section-title">גישה מומלצת</div>
    <p>${esc(br.suggestedApproach)}</p>
  </div>
  ` : ''}

  ${br?.sources?.length ? `
  <div class="section">
    <div class="section-title">מקורות</div>
    ${br.sources.map(s => `<p style="font-size:9pt;color:#6b7280">${esc(s.title || s.url)}</p>`).join('')}
  </div>
  ` : ''}

  <div class="footer">
    <span class="leaders">LEADERS</span> — מסמך מחקר שנוצר אוטומטית
  </div>
</div>
` : ''}

</body>
</html>`
}

function esc(str: string): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
