import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { htmlSlidesToPdf } from '@/lib/render/gotenberg'
import { uploadAndSignedUrl, deckArtifactPath } from '@/lib/render/storage'

export const maxDuration = 600
import { renderProposalToHtml } from '@/templates/quote/proposal-template'
import { generatePremiumProposalSlides } from '@/templates/quote/premium-proposal-template'
import { generateAISlides } from '@/lib/gemini/slide-designer'
import { generateProposalImages } from '@/lib/gemini/proposal-images'
import { presentationToHtmlSlides } from '@/lib/presentation/ast-to-html'
import type { Presentation } from '@/types/presentation'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    const body = await request.json()
    const { documentId, action, generateImages = true } = body

    // Get document from database
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (docError || !document) {
      console.error('Document not found:', docError)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // In dev mode, skip ownership check (user_id might be null)
    // Documents are platform-shared: any authenticated Leaders user may work
    // on any deck (ownership gating removed by request — auth is still required).

    // Get document data
    const documentData = document.data as Record<string, unknown>

    // ─── HTML-Native Presentation path (v6) ─────────────────
    const htmlPres = documentData._htmlPresentation as { htmlSlides?: string[]; brandName?: string; title?: string } | undefined
    if (htmlPres?.htmlSlides?.length) {
      console.log(`[PDF] HTML-Native: ${htmlPres.htmlSlides.length} slides via Gotenberg`)
      const brandNameStr = (htmlPres.brandName || (documentData.brandName as string)) || ''

      const pdfBuffer = await htmlSlidesToPdf(htmlPres.htmlSlides, {
        title: htmlPres.title || brandNameStr || 'Presentation',
        brandName: brandNameStr,
      })
      console.log(`[PDF] PDF rendered: ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`)

      const fileName = `proposal_${document.id}.pdf`
      const { signedUrl } = await uploadAndSignedUrl({
        path: deckArtifactPath(documentId, 'pdf'),
        body: pdfBuffer,
        contentType: 'application/pdf',
      })
      await supabase.from('documents').update({ pdf_url: signedUrl, status: 'generated' }).eq('id', documentId)

      return NextResponse.json({ success: true, pdfUrl: signedUrl, fileName, sizeBytes: pdfBuffer.length })
    }

    // ─── AST Presentation path ─────────────────
    const astPresentation = documentData._presentation as Presentation | undefined
    if (astPresentation && astPresentation.slides?.length > 0) {
      console.log(`[PDF] AST presentation: ${astPresentation.slides.length} slides via Gotenberg`)
      const brandNameStr = (documentData.brandName as string) || ''

      const astHtmlPages = presentationToHtmlSlides(astPresentation, true)
      const pdfBuffer = await htmlSlidesToPdf(astHtmlPages, {
        title: astPresentation.title || brandNameStr || 'Presentation',
        brandName: brandNameStr,
      })

      const fileName = `proposal_${document.id}.pdf`
      const { signedUrl } = await uploadAndSignedUrl({
        path: deckArtifactPath(documentId, 'pdf'),
        body: pdfBuffer,
        contentType: 'application/pdf',
      })
      await supabase.from('documents').update({ pdf_url: signedUrl, status: 'generated' }).eq('id', documentId)

      return NextResponse.json({ success: true, pdfUrl: signedUrl, fileName, sizeBytes: pdfBuffer.length })
    }
    // ─── END AST path ──────────────────────────────────────

    // Check if this is an auto-proposal with rich data
    const isAutoProposal = !!documentData._brandResearch || !!documentData._brandColors || !!documentData.influencerResearch
    
    // Get pre-generated images or generate new ones
    let images: Record<string, string> = (documentData._generatedImages as Record<string, string>) || {}
    
    console.log('[PDF] Document _generatedImages:', {
      hasGeneratedImages: !!documentData._generatedImages,
      keys: Object.keys(images),
      count: Object.keys(images).length,
    })
    
    if (!isAutoProposal && generateImages && process.env.GEMINI_API_KEY && Object.keys(images).length === 0) {
      console.log('[PDF] Generating images with Gemini...')
      try {
        const generatedImages = await generateProposalImages(documentData, documentId)
        // Convert GeneratedImages to Record<string, string>
        images = Object.entries(generatedImages).reduce((acc, [key, value]) => {
          if (typeof value === 'string') acc[key] = value
          return acc
        }, {} as Record<string, string>)
        console.log('[PDF] Generated images:', Object.keys(images))
      } catch (error) {
        console.error('[PDF] Image generation failed, continuing without images:', error)
      }
    }
    
    // Get brand colors and scraped assets
    const brandColors = documentData._brandColors as { primary?: string; secondary?: string; accent?: string } | undefined
    const scrapedAssets = documentData._scraped as { 
      logoUrl?: string
      screenshot?: string
      heroImages?: string[]
      productImages?: string[]
      lifestyleImages?: string[]
    } | undefined
    
    // Build final images - prioritize generated, then scraped, no fallbacks (must be brand-specific)
    const finalImages = {
      coverImage: images.coverImage || scrapedAssets?.heroImages?.[0] || '',
      brandImage: images.brandImage || scrapedAssets?.heroImages?.[1] || scrapedAssets?.heroImages?.[0] || '',
      audienceImage: images.audienceImage || scrapedAssets?.lifestyleImages?.[0] || '',
      activityImage: images.activityImage || scrapedAssets?.lifestyleImages?.[1] || scrapedAssets?.lifestyleImages?.[0] || '',
    }
    
    // Extra images from smart generation
    const extraImages = documentData._extraImages as { id: string; url: string; placement: string }[] | undefined
    
    // Image strategy info
    const imageStrategy = documentData._imageStrategy as { 
      conceptSummary?: string
      visualDirection?: string
      styleGuide?: string 
    } | undefined
    
    console.log('[PDF] Images:', {
      cover: finalImages.coverImage ? 'Yes' : 'No',
      brand: finalImages.brandImage ? 'Yes' : 'No',
      audience: finalImages.audienceImage ? 'Yes' : 'No',
      activity: finalImages.activityImage ? 'Yes' : 'No',
      fromGenerated: !!images.coverImage,
      fromScraped: !images.coverImage && !!scrapedAssets?.heroImages?.[0],
      extraImages: extraImages?.length || 0,
      imageStrategy: imageStrategy?.conceptSummary || 'none',
    })
    
    // Render proposal slides
    let htmlPages: string[]

    if (isAutoProposal) {
      const templateConfig = {
        accentColor: brandColors?.primary || '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        clientLogoUrl: scrapedAssets?.logoUrl,
        images: finalImages,
        extraImages: extraImages,
        imageStrategy: imageStrategy,
      }

      // Check for cached AI slides first
      const cachedSlides = documentData._cachedSlides as string[] | undefined
      if (cachedSlides && cachedSlides.length > 0 && !body.forceRegenerate) {
        console.log(`[PDF] Using ${cachedSlides.length} cached AI slides`)
        htmlPages = cachedSlides
      } else {
        // Try AI-designed slides, fallback to premium template
        try {
          console.log('[PDF] Generating AI-designed slides')
          htmlPages = await generateAISlides(documentData, templateConfig)
          console.log(`[PDF] AI generated ${htmlPages.length} slides`)

          // Cache the AI slides for future preview/PDF requests
          await supabase
            .from('documents')
            .update({ data: { ...documentData, _cachedSlides: htmlPages } })
            .eq('id', documentId)
          console.log('[PDF] Cached AI slides to document')
        } catch (aiError) {
          console.error('[PDF] AI slide generation failed, using premium template:', aiError)
          htmlPages = generatePremiumProposalSlides(documentData, templateConfig)
        }
      }
    } else {
      console.log('[PDF] Using standard template')
      htmlPages = renderProposalToHtml(documentData, {
        accentColor: '#E94560',
        brandLogoUrl: documentData.brandLogoFile as string | undefined,
        images,
      })
    }
    
    console.log(`[PDF] Legacy template: ${htmlPages.length} slides via Gotenberg`)
    const legacyBrandName = (documentData.brandName as string) || ''
    const pdfBuffer = await htmlSlidesToPdf(htmlPages, {
      title: legacyBrandName || 'Proposal',
      brandName: legacyBrandName,
    })

    const fileName = `proposal_${document.id}.pdf`
    const { signedUrl } = await uploadAndSignedUrl({
      path: deckArtifactPath(documentId, 'pdf'),
      body: pdfBuffer,
      contentType: 'application/pdf',
    })
    await supabase
      .from('documents')
      .update({ pdf_url: signedUrl, status: 'generated', data: { ...documentData, _generatedImages: images } })
      .eq('id', documentId)

    return NextResponse.json({
      success: true,
      pdfUrl: signedUrl,
      fileName,
      sizeBytes: pdfBuffer.length,
      generatedImages: Object.keys(images).length,
    })
  } catch (error) {
    console.error('PDF generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    )
  }
}
