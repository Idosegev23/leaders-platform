/**
 * Price Quote HTML Template (הצעת מחיר)
 * Generates 4-page A4 document matching Leaders brand design.
 * Each page is a separate HTML string for multi-page PDF rendering.
 */

import type {
  PriceQuoteData,
  CustomSection,
  SectionToggles,
  QuoteService,
  PageIndex,
} from '@/types/price-quote'
import {
  PRICE_QUOTE_SERVICES,
  COMPANY_INFO,
  LEADERS_ABOUT_TEXT,
  LEGAL_TERMS,
  PAYMENT_TERMS,
  CLIENT_DECLARATION,
} from '@/lib/constants/price-quote-services'

const LOGO_PATH = '/logoblack.png'

const DEFAULT_TOGGLES: SectionToggles = {
  aboutLeaders: true,
  services: true,
  budget: true,
  contentMix: true,
  kpi: true,
  deliverables: true,
  paymentTerms: true,
  declaration: true,
  signature: true,
}

function isOn(data: PriceQuoteData, key: keyof SectionToggles): boolean {
  return data.enabledSections?.[key] ?? DEFAULT_TOGGLES[key]
}

function isPageOn(data: PriceQuoteData, page: PageIndex): boolean {
  return data.enabledPages?.[page] ?? true
}

/** Resolve the page-1 services list — prefers the editable `data.services` over the canned constant. */
function resolveServices(data: PriceQuoteData): QuoteService[] {
  if (data.services && data.services.length > 0) {
    return data.services
  }
  return PRICE_QUOTE_SERVICES.map(s => ({
    id: s.id,
    title: s.title,
    description: s.description,
    selected: data.selectedServiceIds.includes(s.id),
  }))
}

/** Base CSS shared across all pages */
function baseStyles(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800;900&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    html, body {
      width: 794px;
      height: 1123px;
      font-family: 'Heebo', 'Arial Hebrew', sans-serif;
      direction: rtl;
      color: #333;
      background: #fff;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .page {
      width: 794px;
      height: 1123px;
      position: relative;
      overflow: hidden;
      padding: 0;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 40px 50px 20px 50px;
    }

    .header-right {
      text-align: right;
      flex: 1;
    }

    .header-title {
      font-size: 36px;
      font-weight: 900;
      color: #C67A3C;
      line-height: 1.2;
      margin-bottom: 8px;
    }

    .header-subtitle {
      font-size: 20px;
      font-weight: 700;
      color: #555;
      line-height: 1.4;
    }

    .header-contact {
      font-size: 18px;
      font-weight: 500;
      color: #555;
    }

    .header-left {
      flex-shrink: 0;
      margin-right: 30px;
    }

    .logo {
      width: 140px;
      height: auto;
    }

    /* Content area */
    .content {
      padding: 10px 50px 0 50px;
    }

    /* Section headers */
    .section-header {
      background: #C67A3C;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      padding: 10px 24px;
      border-radius: 20px;
      display: inline-block;
      margin-bottom: 16px;
      margin-top: 20px;
    }

    .section-header-dark {
      background: #6B5B50;
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      padding: 10px 24px;
      border-radius: 20px;
      display: inline-block;
      margin-bottom: 16px;
      margin-top: 20px;
    }

    /* Text blocks */
    .about-text {
      font-size: 13px;
      line-height: 1.8;
      color: #444;
      text-align: right;
      margin-bottom: 10px;
    }

    /* Bullet lists */
    .service-list {
      list-style: none;
      padding: 0;
    }

    .service-list li {
      font-size: 12.5px;
      line-height: 1.6;
      color: #444;
      margin-bottom: 6px;
      padding-right: 12px;
      position: relative;
    }

    .service-list li::before {
      content: '•';
      position: absolute;
      right: 0;
      color: #C67A3C;
      font-weight: bold;
    }

    .service-list li strong {
      color: #333;
      font-weight: 700;
    }

    /* Tables */
    .quote-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      direction: rtl;
    }

    .quote-table th {
      background: #C67A3C;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      padding: 10px 16px;
      text-align: right;
    }

    .quote-table td {
      background: #D6E8F0;
      font-size: 13px;
      padding: 12px 16px;
      text-align: right;
      border-bottom: 2px solid #fff;
      vertical-align: middle;
    }

    .quote-table .total-row td {
      background: #B8D4E3;
      font-weight: 700;
      font-size: 14px;
    }

    /* KPI table */
    .kpi-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    .kpi-table th {
      background: #333;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      padding: 12px 20px;
      text-align: center;
    }

    .kpi-table td {
      background: #D6E8F0;
      font-size: 18px;
      font-weight: 700;
      padding: 14px 20px;
      text-align: center;
      color: #333;
    }

    /* Footer */
    .footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      display: flex;
      justify-content: space-between;
      padding: 16px 50px;
      font-size: 10px;
      color: #666;
      border-top: 1px solid #eee;
    }

    .footer-right {
      text-align: right;
    }

    .footer-left {
      text-align: left;
    }

    /* Signature section */
    .signature-fields {
      margin-top: 24px;
      font-size: 14px;
      line-height: 2.4;
      color: #333;
    }

    .signature-line {
      display: inline-block;
      border-bottom: 1px solid #999;
      width: 140px;
      margin: 0 6px;
      vertical-align: bottom;
    }

    .signature-line.filled {
      border-bottom: 1px solid #1a1a2e;
      color: #111;
      font-weight: 500;
      padding: 0 6px 1px;
      min-height: 18px;
    }

    .signature-image {
      display: inline-block;
      max-height: 56px;
      max-width: 240px;
      border-bottom: 1px solid #1a1a2e;
      padding-bottom: 2px;
      vertical-align: bottom;
    }

    .signature-typed {
      display: inline-block;
      min-width: 180px;
      border-bottom: 1px solid #1a1a2e;
      font-family: 'Cormorant Garamond', 'Times New Roman', serif;
      font-style: italic;
      font-size: 26px;
      color: #111;
      padding: 0 8px 2px;
    }
  `
}

/** Footer HTML */
function footerHtml(): string {
  return `
    <div class="footer">
      <div class="footer-right">
        ${COMPANY_INFO.name}<br>
        ח.פ ${COMPANY_INFO.hp}<br>
        תיק ניכויים ${COMPANY_INFO.nikuyim}
      </div>
      <div class="footer-left">
        טלפון ${COMPANY_INFO.phone}<br>
        פקס ${COMPANY_INFO.fax}<br>
        ${COMPANY_INFO.address}
      </div>
    </div>
  `
}

/** Header HTML */
function headerHtml(data: PriceQuoteData, logoUrl: string): string {
  return `
    <div class="header">
      <div class="header-right">
        <div class="header-title">הצעת מחיר - ${data.clientName}</div>
        <div class="header-subtitle">${data.campaignName}</div>
        <div class="header-subtitle">${data.date}</div>
        <div class="header-contact">${data.contactName}</div>
      </div>
      <div class="header-left">
        <img src="${logoUrl}" class="logo" alt="Leaders" />
      </div>
    </div>
  `
}

/** Wrap page content in full HTML document */
function wrapPage(bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=794, initial-scale=1">
  <style>${baseStyles()}</style>
</head>
<body>
  <div class="page">
    ${bodyContent}
  </div>
</body>
</html>`
}

/** Render an editable custom section. */
function renderCustomSection(s: CustomSection): string {
  if (!s.enabled) return ''
  const items = s.items.filter(item => item.trim() !== '')
  if (items.length === 0 && !s.title.trim()) return ''

  const headerClass = s.style === 'dark' ? 'section-header-dark' : 'section-header'
  const titleHtml = s.title.trim() ? `<div class="${headerClass}">${escape(s.title)}</div>` : ''

  if (s.type === 'paragraphs') {
    const paras = items.map(p => `<p class="about-text">${escape(p)}</p>`).join('')
    return `${titleHtml}${paras}`
  }
  // bullets
  const lis = items.map(it => `<li>${escape(it)}</li>`).join('')
  return `${titleHtml}<ul class="service-list">${lis}</ul>`
}

function renderCustomSectionsForPage(data: PriceQuoteData, page: 1 | 2 | 3 | 4): string {
  const sections = (data.customSections ?? []).filter(s => s.page === page)
  return sections.map(renderCustomSection).join('')
}

// ============ PAGE 1: About + Services ============

export function generatePage1(data: PriceQuoteData, logoUrl: string): string {
  const selectedServices = resolveServices(data).filter(s => s.selected)

  const serviceItems = selectedServices.map(s => {
    const title = escape(s.title.trim())
    const description = s.description.trim()
    if (description) {
      return `<li><strong>${title}</strong> - ${escape(description)}</li>`
    }
    return `<li><strong>${title}</strong></li>`
  }).join('')

  const aboutSource = (data.aboutLeadersText && data.aboutLeadersText.trim())
    ? data.aboutLeadersText
    : LEADERS_ABOUT_TEXT
  const aboutParagraphs = aboutSource.split('\n\n').map(p =>
    `<p class="about-text">${escape(p.trim())}</p>`
  ).join('')

  const showAbout = isOn(data, 'aboutLeaders')
  const showServices = isOn(data, 'services')
  const servicesTitle = data.servicesTitle?.trim() || 'ניהול שוטף'

  const aboutBlock = showAbout
    ? `<div class="section-header">לידרס</div>${aboutParagraphs}`
    : ''

  const servicesBlock = (showServices && serviceItems)
    ? `<div class="section-header">${escape(servicesTitle)}</div>
       <ul class="service-list">${serviceItems}</ul>`
    : ''

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      ${aboutBlock}
      ${servicesBlock}
      ${renderCustomSectionsForPage(data, 1)}
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 2: Budget + Content Mix + KPI ============

export function generatePage2(data: PriceQuoteData, logoUrl: string): string {
  const showBudget = isOn(data, 'budget')
  const showContentMix = isOn(data, 'contentMix')
  const showKpi = isOn(data, 'kpi')

  const budgetRows = data.budgetItems.map(item => `
    <tr>
      <td>${escape(item.service)}</td>
      <td>${escape(item.detail)}</td>
      <td>${escape(item.price || '')}</td>
    </tr>
  `).join('')

  const contentRows = data.contentMix.map(item => `
    <tr>
      <td>${escape(item.detail)}</td>
      <td>${escape(item.monthlyPerInfluencer)}</td>
      <td>${escape(item.total)}</td>
    </tr>
  `).join('')

  const budgetBlock = showBudget ? `
      <div class="section-header">תקציב</div>
      <table class="quote-table">
        <thead>
          <tr>
            <th>שירות</th>
            <th>פירוט</th>
            <th>תקציב</th>
          </tr>
        </thead>
        <tbody>
          ${budgetRows}
          <tr class="total-row">
            <td colspan="2">סה"כ תקציב (לפני מע"מ)</td>
            <td>${escape(data.totalBudget)}</td>
          </tr>
        </tbody>
      </table>
    ` : ''

  const contentMixBlock = (showContentMix && contentRows) ? `
      <div class="section-header">תמהיל תוכן</div>
      <table class="quote-table">
        <thead>
          <tr>
            <th>פירוט</th>
            <th>חודשי פר משפיען</th>
            <th>סה"כ</th>
          </tr>
        </thead>
        <tbody>
          ${contentRows}
        </tbody>
      </table>
    ` : ''

  const kpiBlock = (showKpi && (data.kpi.cpv || data.kpi.estimatedImpressions)) ? `
      <div style="text-align:center; margin-top: 10px;">
        <span class="section-header" style="font-size: 20px; padding: 10px 40px; background: #333;">KPI</span>
      </div>
      <table class="kpi-table" style="margin-top: 16px;">
        <thead>
          <tr>
            <th>CPV</th>
            <th>כמות חשיפות משוערת</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${escape(data.kpi.cpv)}</td>
            <td>${escape(data.kpi.estimatedImpressions)}</td>
          </tr>
        </tbody>
      </table>
    ` : ''

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      ${budgetBlock}
      ${contentMixBlock}
      ${kpiBlock}
      ${renderCustomSectionsForPage(data, 2)}
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 3: Deliverables & Terms ============

export function generatePage3(data: PriceQuoteData, logoUrl: string): string {
  const showDeliverables = isOn(data, 'deliverables')

  const legalSource = data.legalTerms && data.legalTerms.length > 0
    ? data.legalTerms.filter(t => t.trim() !== '')
    : LEGAL_TERMS

  const dynamicNotes = [
    data.platform.trim() ? `פלטפורמת הפעילות- ${data.platform}` : '',
    data.contractPeriod.trim() ? `תקופת ההסכם - ${data.contractPeriod}` : '',
    'התוצרים יעלו על בסיס גאנט מאושר מראש',
    ...data.additionalNotes,
  ].filter(t => t.trim() !== '')

  const allNotes = [...dynamicNotes, ...legalSource]
  const noteItems = allNotes.map(n => `<li>${escape(n)}</li>`).join('')
  const deliverablesTitle = data.deliverablesTitle?.trim() || 'תוצרים ושירותים'

  const deliverablesBlock = (showDeliverables && noteItems) ? `
      <div class="section-header-dark">${escape(deliverablesTitle)}</div>
      <ul class="service-list">
        ${noteItems}
      </ul>
    ` : ''

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      ${deliverablesBlock}
      ${renderCustomSectionsForPage(data, 3)}
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 4: Payment & Signature ============

export function generatePage4(data: PriceQuoteData, logoUrl: string): string {
  const showPayment = isOn(data, 'paymentTerms')
  const showDeclaration = isOn(data, 'declaration')
  const showSignature = isOn(data, 'signature')

  const pt = data.paymentTerms ?? PAYMENT_TERMS
  const declaration = data.clientDeclarationText?.trim() || CLIENT_DECLARATION

  const paymentBlock = showPayment ? `
      <div class="section-header-dark">תוקף ותנאי תשלום</div>
      <ul class="service-list">
        ${pt.activation.trim() ? `<li>${escape(pt.activation)}</li>` : ''}
        ${pt.payment.trim() ? `<li>${escape(pt.payment)}</li>` : ''}
      </ul>
    ` : ''

  const declarationBlock = showDeclaration ? `
      <div class="section-header-dark" style="margin-top: 30px;">הצהרה ואישור הלקוח</div>
      <p class="about-text" style="margin-top: 10px; font-size: 14px;">
        ${escape(declaration)}
      </p>
    ` : ''

  const signatureBlock = showSignature ? signatureBlockHtml(data) : ''

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      ${paymentBlock}
      ${declarationBlock}
      ${signatureBlock}
      ${renderCustomSectionsForPage(data, 4)}
    </div>
    ${footerHtml()}
  `)
}

/** Signature block — uses the signed values from data.signature when present */
function signatureBlockHtml(data: PriceQuoteData): string {
  const sig = data.signature
  const filled = (v?: string | null, width?: string) =>
    v
      ? `<span class="signature-line filled"${width ? ` style="width: ${width};"` : ''}>${escape(v)}</span>`
      : `<span class="signature-line"${width ? ` style="width: ${width};"` : ''}></span>`

  const sigImageHtml = sig?.image_data_url
    ? `<img class="signature-image" src="${sig.image_data_url}" alt="signature" />`
    : sig?.typed_name
      ? `<span class="signature-typed">${escape(sig.typed_name)}</span>`
      : `<span class="signature-line" style="width: 180px;"></span>`

  return `
    <div class="signature-fields">
      תאריך: ${filled(sig?.date)}
      שם מלא: ${filled(sig?.signer_name)}
      ת.ז: ${filled(sig?.id_number)}
      תפקיד: ${filled(sig?.signer_role)}
      <br>
      חתימה: ${sigImageHtml}
      <br>
      שם החברה: ${filled(sig?.company_name, '180px')}
      ח.פ: ${filled(sig?.company_hp)}
      חותמת: ${filled(null, '180px')}
    </div>
  `
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate the pages that go into the final PDF — disabled pages are filtered out.
 * Used by the PDF generation endpoints.
 */
export function generatePriceQuotePages(data: PriceQuoteData, logoBaseUrl: string): string[] {
  const logoUrl = `${logoBaseUrl}${LOGO_PATH}`
  const all: Array<[PageIndex, string]> = [
    [1, generatePage1(data, logoUrl)],
    [2, generatePage2(data, logoUrl)],
    [3, generatePage3(data, logoUrl)],
    [4, generatePage4(data, logoUrl)],
  ]
  return all.filter(([p]) => isPageOn(data, p)).map(([, html]) => html)
}

/**
 * Generate ALL 4 pages regardless of enabled/disabled state.
 * Used by the live preview so disabled pages remain visible/editable in the UI.
 */
export function generateAllQuotePages(data: PriceQuoteData, logoBaseUrl: string): string[] {
  const logoUrl = `${logoBaseUrl}${LOGO_PATH}`
  return [
    generatePage1(data, logoUrl),
    generatePage2(data, logoUrl),
    generatePage3(data, logoUrl),
    generatePage4(data, logoUrl),
  ]
}
