/**
 * PDF export for Gamma-prototype structured presentations.
 *
 * Renders each slide via renderStructuredSlide() (no editor script),
 * then screenshots via Playwright/Chromium (same path as main /api/pdf route).
 * Uploads to Supabase Storage and returns the public URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateScreenshotPdf } from '@/lib/playwright/pdf'
import { renderStructuredSlide } from '@/lib/gemini/layout-prototypes/renderer'
import type { StructuredPresentation } from '@/lib/gemini/layout-prototypes/types'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 600

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const { documentId, presentation } = await req.json() as {
      documentId: string; presentation?: StructuredPresentation
    }
    if (!documentId) return NextResponse.json({ error: 'documentId required' }, { status: 400 })

    let pres = presentation
    if (!pres) {
      const { data: doc } = await supabase
        .from('documents').select('*').eq('id', documentId).single()
      if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      if (!isDevMode && doc.user_id !== userId)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      pres = (doc.data as Record<string, unknown>)?._structuredPresentation as StructuredPresentation
    }
    if (!pres?.slides?.length)
      return NextResponse.json({ error: 'No slides to export' }, { status: 400 })

    const htmlSlides = pres.slides.map((s) => renderStructuredSlide(s, pres!.designSystem))
    console.log(`[gamma-pdf] rendering ${htmlSlides.length} slides`)

    const pdfBuffer = await generateScreenshotPdf(htmlSlides, {
      format: '16:9',
      title: pres.brandName || 'Presentation',
      brandName: pres.brandName || '',
    })

    const fileName = `gamma_${documentId}_${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
    return NextResponse.json({
      success: true,
      pdfUrl: urlData.publicUrl,
      sizeBytes: pdfBuffer.length,
      slideCount: htmlSlides.length,
    })
  } catch (err) {
    console.error('[gamma-pdf] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
