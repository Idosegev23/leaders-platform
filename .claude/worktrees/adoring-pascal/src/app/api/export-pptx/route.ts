import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePptx } from '@/lib/export/pptx-generator'
import { renderProposalToHtml } from '@/templates/quote/proposal-template'
import { generatePremiumProposalSlides } from '@/templates/quote/premium-proposal-template'
import { generateAISlides } from '@/lib/gemini/slide-designer'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const requestId = `pptx-${Date.now()}`
  console.log(`[${requestId}] PPTX export started`)

  try {
    const supabase = await createClient()

    // Auth check
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const { documentId } = await request.json()
    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
    }

    // Fetch document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error(`[${requestId}] Document not found:`, docError)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const documentData = document.data as Record<string, unknown>
    const brandName = (documentData.brandName as string) || 'proposal'
    const isAutoProposal = !!documentData._brandResearch || !!documentData._brandColors || !!documentData.influencerResearch

    console.log(`[${requestId}] Generating PPTX for: ${brandName}`)

    // Get HTML slides (same logic as PDF route)
    let htmlSlides: string[]

    if (isAutoProposal) {
      const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
      const scrapedAssets = documentData._scraped as { logoUrl?: string; heroImages?: string[]; lifestyleImages?: string[] } | undefined
      const images = (documentData._generatedImages as Record<string, string>) || {}
      const extraImages = documentData._extraImages as { id: string; url: string; placement: string }[] | undefined
      const imageStrategy = documentData._imageStrategy as { conceptSummary?: string; visualDirection?: string; styleGuide?: string } | undefined

      const templateConfig = {
        accentColor: brandColors?.primary || '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        clientLogoUrl: scrapedAssets?.logoUrl,
        images: {
          coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || '',
          brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || scrapedAssets?.heroImages?.[0] || '',
          audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || '',
          activityImage: images.activityImage || scrapedAssets?.lifestyleImages?.[1] || scrapedAssets?.lifestyleImages?.[0] || '',
        },
        extraImages,
        imageStrategy,
      }

      // Check for cached AI slides first
      const cachedSlides = documentData._cachedSlides as string[] | undefined
      if (cachedSlides && cachedSlides.length > 0) {
        console.log(`[${requestId}] Using ${cachedSlides.length} cached AI slides`)
        htmlSlides = cachedSlides
      } else {
        // Try AI-designed slides, fallback to premium template
        try {
          console.log(`[${requestId}] Generating AI slides`)
          htmlSlides = await generateAISlides(documentData, templateConfig)
          console.log(`[${requestId}] AI generated ${htmlSlides.length} slides`)

          // Cache for future requests
          await supabase
            .from('documents')
            .update({ data: { ...documentData, _cachedSlides: htmlSlides } })
            .eq('id', documentId)
        } catch (aiError) {
          console.error(`[${requestId}] AI slide generation failed, using premium template:`, aiError)
          htmlSlides = generatePremiumProposalSlides(documentData, templateConfig)
        }
      }
    } else {
      const images = (documentData._generatedImages as Record<string, string>) || {}
      htmlSlides = renderProposalToHtml(documentData, {
        accentColor: '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        images,
      })
    }

    console.log(`[${requestId}] Rendering ${htmlSlides.length} slides to PPTX (hybrid: image bg + text overlays)`)

    // Generate PPTX (renders HTML→PNG then builds slides with text overlays)
    const buffer = await generatePptx(documentData, htmlSlides)

    console.log(`[${requestId}] PPTX generated: ${buffer.length} bytes`)

    // Return as downloadable file
    const filename = encodeURIComponent(`${brandName}.pptx`)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    })
  } catch (error) {
    console.error(`[${requestId}] PPTX export failed:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'PPTX export failed' },
      { status: 500 }
    )
  }
}
