import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateMultiPagePdf } from '@/lib/playwright/pdf'

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
    if (!isDevMode && document.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get document data
    const documentData = document.data as Record<string, unknown>

    // ─── AST Presentation path ─────────────────────────────
    // If `_presentation` exists, use the AST pipeline (convert AST → HTML → PDF)
    const astPresentation = documentData._presentation as Presentation | undefined
    if (astPresentation && astPresentation.slides?.length > 0) {
      console.log(`[PDF] Using AST presentation with ${astPresentation.slides.length} slides`)
      const astHtmlPages = presentationToHtmlSlides(astPresentation, true)
      console.log(`[PDF] Converted AST to ${astHtmlPages.length} HTML pages`)

      const brandNameStr = (documentData.brandName as string) || ''
      const pdfBuffer = await generateMultiPagePdf(astHtmlPages, {
        format: '16:9',
        title: astPresentation.title || brandNameStr || 'Presentation',
        brandName: brandNameStr,
      })
      console.log(`[PDF] Generated PDF, size: ${pdfBuffer.length} bytes`)

      const fileName = `proposal_${document.id}_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, pdfBuffer, { contentType: 'application/pdf', upsert: true })
      if (uploadError) console.error('Upload error:', uploadError)

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(fileName)
      await supabase
        .from('documents')
        .update({ pdf_url: urlData.publicUrl, status: 'generated' })
        .eq('id', documentId)

      if (action === 'download') {
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${fileName}"`,
          },
        })
      }
      return NextResponse.json({ success: true, pdfUrl: urlData.publicUrl })
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
    
    console.log(`[PDF] Rendering ${htmlPages.length} slides...`)
    
    // Generate multi-page PDF in 16:9 format
    const legacyBrandName = (documentData.brandName as string) || ''
    const pdfBuffer = await generateMultiPagePdf(htmlPages, {
      format: '16:9',
      title: legacyBrandName || 'Proposal',
      brandName: legacyBrandName,
    })
    
    console.log(`[PDF] Generated PDF, size: ${pdfBuffer.length} bytes`)

    // Upload to Supabase Storage
    const fileName = `proposal_${document.id}_${Date.now()}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      // Continue anyway - we can still return the PDF for download
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(fileName)

    // Update document with PDF URL and generated images
    await supabase
      .from('documents')
      .update({
        pdf_url: urlData.publicUrl,
        status: 'generated',
        data: {
          ...documentData,
          _generatedImages: images,
        }
      })
      .eq('id', documentId)

    if (action === 'download') {
      // Return PDF directly for download
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      })
    }

    return NextResponse.json({
      success: true,
      pdfUrl: urlData.publicUrl,
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
