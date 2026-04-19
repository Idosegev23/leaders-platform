/**
 * Price Quote HTML Template (הצעת מחיר)
 * Generates 4-page A4 document matching Leaders brand design.
 * Each page is a separate HTML string for multi-page PDF rendering.
 */

import type { PriceQuoteData } from '@/types/price-quote'
import {
  PRICE_QUOTE_SERVICES,
  COMPANY_INFO,
  LEADERS_ABOUT_TEXT,
  LEGAL_TERMS,
  PAYMENT_TERMS,
  CLIENT_DECLARATION,
} from '@/lib/constants/price-quote-services'

const LOGO_PATH = '/logoblack.png'

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

// ============ PAGE 1: About + Services ============

export function generatePage1(data: PriceQuoteData, logoUrl: string): string {
  const selectedServices = PRICE_QUOTE_SERVICES.filter(s =>
    data.selectedServiceIds.includes(s.id)
  )

  const serviceItems = selectedServices.map(s => {
    if (s.description) {
      return `<li><strong>${s.title}</strong> - ${s.description}</li>`
    }
    return `<li><strong>${s.title}</strong></li>`
  }).join('')

  const aboutParagraphs = LEADERS_ABOUT_TEXT.split('\n\n').map(p =>
    `<p class="about-text">${p.trim()}</p>`
  ).join('')

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      <div class="section-header">לידרס</div>
      ${aboutParagraphs}

      <div class="section-header">ניהול שוטף</div>
      <ul class="service-list">
        ${serviceItems}
      </ul>
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 2: Budget + Content Mix + KPI ============

export function generatePage2(data: PriceQuoteData, logoUrl: string): string {
  const budgetRows = data.budgetItems.map(item => `
    <tr>
      <td>${item.service}</td>
      <td>${item.detail}</td>
      <td>${item.price || ''}</td>
    </tr>
  `).join('')

  const contentRows = data.contentMix.map(item => `
    <tr>
      <td>${item.detail}</td>
      <td>${item.monthlyPerInfluencer}</td>
      <td>${item.total}</td>
    </tr>
  `).join('')

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
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
            <td>${data.totalBudget}</td>
          </tr>
        </tbody>
      </table>

      ${contentRows ? `
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
      ` : ''}

      ${(data.kpi.cpv || data.kpi.estimatedImpressions) ? `
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
            <td>${data.kpi.cpv}</td>
            <td>${data.kpi.estimatedImpressions}</td>
          </tr>
        </tbody>
      </table>
      ` : ''}
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 3: Deliverables & Terms ============

export function generatePage3(data: PriceQuoteData, logoUrl: string): string {
  const dynamicNotes = [
    `פלטפורמת הפעילות- ${data.platform}`,
    `תקופת ההסכם - ${data.contractPeriod}`,
    'התוצרים יעלו על בסיס גאנט מאושר מראש',
    ...data.additionalNotes,
  ]

  const allNotes = [...dynamicNotes, ...LEGAL_TERMS]

  const noteItems = allNotes.map(n => `<li>${n}</li>`).join('')

  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      <div class="section-header-dark">תוצרים ושירותים</div>
      <ul class="service-list">
        ${noteItems}
      </ul>
    </div>
    ${footerHtml()}
  `)
}

// ============ PAGE 4: Payment & Signature ============

export function generatePage4(data: PriceQuoteData, logoUrl: string): string {
  return wrapPage(`
    ${headerHtml(data, logoUrl)}
    <div class="content">
      <div class="section-header-dark">תוקף ותנאי תשלום</div>
      <ul class="service-list">
        <li>${PAYMENT_TERMS.activation}</li>
        <li>${PAYMENT_TERMS.payment}</li>
      </ul>

      <div class="section-header-dark" style="margin-top: 30px;">הצהרה ואישור הלקוח</div>
      <p class="about-text" style="margin-top: 10px; font-size: 14px;">
        ${CLIENT_DECLARATION}
      </p>

      <div class="signature-fields">
        תאריך: <span class="signature-line"></span>
        שם מלא: <span class="signature-line"></span>
        ת.ז: <span class="signature-line"></span>
        תפקיד: <span class="signature-line"></span>
        <br>
        חתימה: <span class="signature-line"></span>
        <br>
        שם החברה: <span class="signature-line" style="width: 180px;"></span>
        ח.פ: <span class="signature-line"></span>
        חותמת: <span class="signature-line" style="width: 180px;"></span>
      </div>
    </div>
    ${footerHtml()}
  `)
}

/** Generate all 4 pages as HTML strings */
export function generatePriceQuotePages(data: PriceQuoteData, logoBaseUrl: string): string[] {
  const logoUrl = `${logoBaseUrl}${LOGO_PATH}`
  return [
    generatePage1(data, logoUrl),
    generatePage2(data, logoUrl),
    generatePage3(data, logoUrl),
    generatePage4(data, logoUrl),
  ]
}
