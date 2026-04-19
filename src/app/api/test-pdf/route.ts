/**
 * GET /api/test-pdf
 * Generates PDF from test presentation using React renderer.
 */

import { NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { generateReactPdf } from '@/lib/playwright/pdf'

export const maxDuration = 120

export async function GET() {
  if (!existsSync('/tmp/test-presentation.json')) {
    return NextResponse.json({ error: 'Run POST /api/test-generate first' }, { status: 404 })
  }

  console.log(`[TestPDF] Generating React PDF for test-local...`)
  const pdfBuffer = await generateReactPdf('test-local', {
    format: '16:9',
    title: 'Test Presentation',
    brandName: 'CHERY',
  })

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="test-presentation.pdf"`,
    },
  })
}
