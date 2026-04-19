import { NextRequest, NextResponse } from 'next/server'
import { researchBrand } from '@/lib/gemini/brand-research'
import { extractColorsFromLogo, analyzeColorPalette, extractColorsByBrandName } from '@/lib/gemini/color-extractor'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { brandName, websiteData } = body

    if (!brandName) {
      return NextResponse.json({ error: 'Brand name is required' }, { status: 400 })
    }

    console.log(`[API Research] Starting deep research for: ${brandName}`)

    // Convert websiteData to research format if provided
    const researchWebsiteData = websiteData ? {
      url: websiteData.url,
      title: websiteData.title,
      description: websiteData.description,
      headings: [
        ...(websiteData.headings?.h1 || []),
        ...(websiteData.headings?.h2 || []),
      ],
      paragraphs: websiteData.paragraphs || [],
      socialLinks: Object.values(websiteData.socialLinks || {}).filter(Boolean) as string[],
    } : undefined

    // Run brand research + visual research in parallel
    const [research, brandColorData] = await Promise.all([
      researchBrand(brandName, researchWebsiteData),
      extractColorsByBrandName(brandName),   // ← NEW: always runs, uses Google Search
    ])

    console.log(`[API Research] Research complete, confidence: ${research.confidence}`)
    console.log(`[API Research] Brand colors from name: primary=${brandColorData.primary}, logoUrl=${brandColorData.logoUrl || 'none'}`)

    // Extract colors — priority chain
    let colors = null

    // 1. If we got a logoUrl from extractColorsByBrandName, use it for precise extraction
    const discoveredLogoUrl = brandColorData.logoUrl
    if (discoveredLogoUrl && !discoveredLogoUrl.endsWith('.svg')) {
      console.log('[API Research] Extracting colors from discovered logo:', discoveredLogoUrl)
      try {
        colors = await extractColorsFromLogo(discoveredLogoUrl)
        console.log('[API Research] Discovered logo colors extracted')
      } catch {
        console.warn('[API Research] Discovered logo extraction failed, falling back')
      }
    }

    // 2. Try logo from websiteData (if provided)
    if (!colors) {
      const websiteLogoUrl = websiteData?.logos?.primary || websiteData?.logoUrl
      if (websiteLogoUrl && !websiteLogoUrl.endsWith('.svg')) {
        try {
          colors = await extractColorsFromLogo(websiteLogoUrl)
        } catch { /* continue */ }
      }
    }

    // 3. Use extractColorsByBrandName result (already have it)
    if (!colors) {
      colors = brandColorData
    }

    // 4. Try CSS colors from websiteData
    const cssColors = websiteData?.dominantColors || websiteData?.cssColors
    if (!colors && cssColors?.length > 0) {
      colors = await analyzeColorPalette(cssColors)
    }

    // 5. Use research visualIdentity colors
    if (!colors && research.visualIdentity?.primaryColors?.length > 0) {
      colors = {
        primary: research.visualIdentity.primaryColors[0],
        secondary: research.visualIdentity.primaryColors[1] || '#666666',
        accent: research.visualIdentity.primaryColors[0],
        background: '#FFFFFF',
        text: '#111111',
        palette: research.visualIdentity.primaryColors,
        style: 'minimal' as const,
        mood: research.visualIdentity.style || 'מקצועי',
      }
    }

    // 6. Absolute fallback
    if (!colors) {
      colors = {
        primary: '#111111',
        secondary: '#666666',
        accent: '#E94560',
        background: '#FFFFFF',
        text: '#111111',
        palette: ['#111111', '#666666', '#E94560'],
        style: 'minimal' as const,
        mood: 'מקצועי ומודרני',
      }
    }

    console.log(`[API Research] Final colors: primary=${colors.primary}, accent=${colors.accent}`)

    return NextResponse.json({
      success: true,
      research,
      colors,
      logoUrl: discoveredLogoUrl || websiteData?.logos?.primary || null,
      logos: websiteData?.logos || null,
    })
  } catch (error) {
    console.error('[API Research] Error:', error)
    return NextResponse.json(
      { error: 'Failed to research brand', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

