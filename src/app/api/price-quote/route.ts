import { NextRequest, NextResponse } from 'next/server'
import { generatePriceQuotePages } from '@/templates/price-quote/price-quote-template'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'
import type { PriceQuoteData } from '@/types/price-quote'

export const maxDuration = 120

/**
 * POST /api/price-quote
 * Generates a PDF price quote from the provided data.
 * Returns the PDF as a downloadable file.
 */
export async function POST(request: NextRequest) {
  const requestId = `price-quote-${Date.now()}`
  console.log(`[${requestId}] 📄 PRICE QUOTE PDF - START`)

  try {
    const data: PriceQuoteData = await request.json()

    if (!data.clientName || !data.campaignName) {
      return NextResponse.json(
        { error: 'clientName and campaignName are required' },
        { status: 400 }
      )
    }

    // Use the request origin as base URL for logo
    const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'http://localhost:3000'

    console.log(`[${requestId}] Generating 4-page quote for "${data.clientName}"`)

    const pages = generatePriceQuotePages(data, origin)

    console.log(`[${requestId}] Rendering PDF...`)
    const pdfBuffer = await generateMultiPagePdf(pages, {
      format: 'A4',
      title: `הצעת מחיר - ${data.clientName}`,
      brandName: data.clientName,
    })

    console.log(`[${requestId}] ✅ PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`)

    const filename = `הצעת_מחיר_${data.clientName}_${data.date.replace(/\./g, '-')}.pdf`

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error(`[${requestId}] ❌ Error:`, error)
    return NextResponse.json(
      { error: 'Failed to generate price quote PDF' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/price-quote
 * Returns HTML preview of the price quote (for iframe preview).
 * Query params: data (JSON encoded PriceQuoteData), page (1-4)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const dataParam = searchParams.get('data')
  const pageNum = parseInt(searchParams.get('page') || '1')

  if (!dataParam) {
    return NextResponse.json({ error: 'data param required' }, { status: 400 })
  }

  try {
    const data: PriceQuoteData = JSON.parse(dataParam)
    const origin = request.headers.get('origin') || request.headers.get('referer')?.replace(/\/[^/]*$/, '') || 'http://localhost:3000'
    const pages = generatePriceQuotePages(data, origin)
    const idx = Math.max(0, Math.min(pageNum - 1, pages.length - 1))

    return new NextResponse(pages[idx], {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }
}
