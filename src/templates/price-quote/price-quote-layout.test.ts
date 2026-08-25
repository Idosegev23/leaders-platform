/**
 * Layout regression tests for the client-facing price quote.
 *
 * The two defects these lock down were both invisible in the editor (its preview
 * is a hard-cropped 595×842 frame) and only showed up in the PDF the client got:
 *   1. content painted *underneath* the footer — text on text at the page bottom
 *   2. content past the page box was clipped away and silently lost
 *
 * They are geometric, so the assertions are geometric: render the real template
 * in Chrome and measure. Skipped when no local Chrome is present.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync } from 'node:fs'
import puppeteer, { type Browser } from 'puppeteer-core'
import { PDFDocument } from 'pdf-lib'
import { generateAllQuotePages } from './price-quote-template'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import { PRICE_QUOTE_SERVICES } from '@/lib/constants/price-quote-services'
import type { PriceQuoteData } from '@/types/price-quote'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]
const chromePath = CHROME_CANDIDATES.find(existsSync)

/** A4 at 96dpi — the box every page must live inside. */
const A4_W = 794
const A4_H = 1123

/** The quote an account manager sends today: every canned service, stock copy. */
function standardQuote(): PriceQuoteData {
  return {
    clientName: 'שופרסל',
    campaignName: 'קמפיין קיץ 2026 — משפיעניות לייף סטייל',
    date: '25.08.2026',
    contactName: 'נועה סבג',
    selectedServiceIds: PRICE_QUOTE_SERVICES.map(s => s.id),
    budgetItems: [
      { service: 'משפיעניות', detail: '4 משפיעניות · 3 חודשים', price: '210,000₪' },
      { service: 'ניהול ותפעול', detail: 'מנהלת לקוח + מפיקה', price: '45,000₪' },
      { service: 'הפקת תוכן', detail: 'צילום ועריכה', price: '28,000₪' },
      { service: 'מדיה', detail: 'קידום ממומן', price: '35,000₪' },
    ],
    totalBudget: '318,000₪',
    contentMix: [
      { detail: 'רילס', monthlyPerInfluencer: '2', total: '24' },
      { detail: 'סטוריז', monthlyPerInfluencer: '6', total: '72' },
      { detail: 'פוסט סטטי', monthlyPerInfluencer: '1', total: '12' },
    ],
    kpi: { cpv: '0.12₪', estimatedImpressions: '2,650,000' },
    platform: 'אינסטגרם / טיקטוק',
    contractPeriod: 'ספטמבר 26 — נובמבר 26',
    additionalNotes: [
      'התכנים יאושרו מראש על ידי הלקוח בשני סבבי תיקונים',
      'זכויות שימוש בתכנים למשך 12 חודשים מיום העלייה',
    ],
    quoteNumber: 'Q-2026-0148',
    revisionNumber: 2,
  } as PriceQuoteData
}

/** Same deal, bigger scope — the shape that overflowed and lost its KPI table. */
function oversizedQuote(): PriceQuoteData {
  const base = standardQuote()
  return {
    ...base,
    budgetItems: [
      ...base.budgetItems,
      { service: 'קריאייטיב', detail: 'קונספט + סטוריבורד', price: '18,000₪' },
      { service: 'דשבורד', detail: 'הקמה וניהול', price: '9,000₪' },
      { service: 'צילום סטילס', detail: 'יום צילום אחד', price: '12,000₪' },
    ],
    contentMix: [
      ...base.contentMix,
      { detail: 'טיקטוק', monthlyPerInfluencer: '3', total: '36' },
      { detail: 'לייב', monthlyPerInfluencer: '1', total: '12' },
    ],
    additionalNotes: [
      ...base.additionalNotes,
      'הלקוח יספק את המוצרים למשפיעניות עד 14 יום לפני תחילת הפעילות',
      'כל שינוי בהיקף הפעילות יתומחר בנפרד ויאושר בכתב מראש',
      'דוח ביצועים מסכם יימסר עד 30 יום מתום הפעילות',
    ],
  }
}

interface PageGeometry {
  /** Bottom-most edge of any in-flow content, in page coordinates. */
  contentBottom: number
  /** Top edge of the footer band. */
  footerTop: number
  /** Full height the document actually renders, before any clipping. */
  documentHeight: number
  /** Widest rendered box — catches content escaping the A4 width. */
  contentRight: number
  contentLeft: number
}

let browser: Browser

beforeAll(async () => {
  if (!chromePath) return
  browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--force-color-profile=srgb'],
  })
}, 60_000)

afterAll(async () => {
  await browser?.close()
})

async function measure(html: string): Promise<PageGeometry> {
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: A4_W, height: A4_H, deviceScaleFactor: 1 })
    await page.emulateMediaType('screen')
    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts?.ready)
    await new Promise(r => setTimeout(r, 500))

    return await page.evaluate(() => {
      const footer = document.querySelector('.footer') as HTMLElement
      const footerRect = footer.getBoundingClientRect()

      // Every leaf box that carries content, excluding the footer subtree.
      const nodes = Array.from(document.querySelectorAll('.content, .content *'))
        .filter(el => !footer.contains(el)) as HTMLElement[]
      const rects = nodes
        .map(el => el.getBoundingClientRect())
        .filter(r => r.height > 0 && r.width > 0)

      return {
        contentBottom: Math.round(Math.max(...rects.map(r => r.bottom))),
        footerTop: Math.round(footerRect.top),
        documentHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        ),
        contentRight: Math.round(Math.max(...rects.map(r => r.right))),
        contentLeft: Math.round(Math.min(...rects.map(r => r.left))),
      }
    })
  } finally {
    await page.close()
  }
}

describe.skipIf(!chromePath)('price quote — A4 page boundaries', () => {
  it('never paints content underneath the footer', async () => {
    for (const [label, data] of [
      ['standard', standardQuote()],
      ['oversized', oversizedQuote()],
    ] as const) {
      const pages = generateAllQuotePages(data, 'http://localhost:3000')
      for (let i = 0; i < pages.length; i++) {
        const g = await measure(pages[i])
        expect(
          g.contentBottom,
          `${label} page ${i + 1}: content ends at ${g.contentBottom}px but the footer ` +
            `starts at ${g.footerTop}px — ${g.contentBottom - g.footerTop}px of text is ` +
            `painted on top of the footer`,
        ).toBeLessThanOrEqual(g.footerTop)
      }
    }
  }, 180_000)

  it('never clips content outside the rendered page box', async () => {
    const pages = generateAllQuotePages(oversizedQuote(), 'http://localhost:3000')
    for (let i = 0; i < pages.length; i++) {
      const g = await measure(pages[i])
      expect(
        g.contentBottom,
        `oversized page ${i + 1}: ${g.contentBottom - g.documentHeight}px of content sits ` +
          `below the ${g.documentHeight}px document and is clipped away`,
      ).toBeLessThanOrEqual(g.documentHeight)
    }
  }, 180_000)

  it('keeps every page inside the A4 width', async () => {
    const pages = generateAllQuotePages(oversizedQuote(), 'http://localhost:3000')
    for (let i = 0; i < pages.length; i++) {
      const g = await measure(pages[i])
      expect(g.contentLeft, `page ${i + 1} escapes the left edge`).toBeGreaterThanOrEqual(0)
      expect(g.contentRight, `page ${i + 1} escapes the right edge`).toBeLessThanOrEqual(A4_W)
    }
  }, 180_000)
})

describe.skipIf(!chromePath)('price quote — rendered PDF', () => {
  it('renders the standard quote as exactly 4 A4 pages', async () => {
    const pages = generateAllQuotePages(standardQuote(), 'http://localhost:3000')
    const pdf = await generateMultiPagePdf(pages, { format: 'A4', title: 't', brandName: 'b' })
    const doc = await PDFDocument.load(pdf)

    expect(doc.getPageCount()).toBe(4)
    for (const p of doc.getPages()) {
      // True A4 is 595.276 × 841.890pt. Chrome's rasteriser lands within a
      // rounding step of that; anything further out means the @page rule was
      // lost and the sheet is no longer A4.
      const mm = (pt: number) => (pt / 72) * 25.4
      expect(mm(p.getSize().width)).toBeCloseTo(210, 0)
      expect(mm(p.getSize().height)).toBeCloseTo(297, 0)
    }
  }, 180_000)

  it('flows genuine overflow onto an extra page instead of dropping it', async () => {
    const pages = generateAllQuotePages(oversizedQuote(), 'http://localhost:3000')
    const pdf = await generateMultiPagePdf(pages, { format: 'A4', title: 't', brandName: 'b' })
    const doc = await PDFDocument.load(pdf)

    expect(doc.getPageCount()).toBeGreaterThan(4)
  }, 180_000)
})
