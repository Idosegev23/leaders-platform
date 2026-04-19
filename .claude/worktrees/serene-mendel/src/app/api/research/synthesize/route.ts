import { NextRequest, NextResponse } from 'next/server'
import { synthesizeResearch } from '@/lib/gemini/brand-research'
import { extractColorsFromLogo, analyzeColorPalette, extractColorsByBrandName } from '@/lib/gemini/color-extractor'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const requestId = `synthesize-${Date.now()}`
  try {
    const body = await request.json()
    const { brandName, gatheredData, websiteData } = body

    if (!brandName || !gatheredData?.length) {
      return NextResponse.json({ error: 'brandName and gatheredData are required' }, { status: 400 })
    }

    console.log(`[${requestId}] Synthesizing ${gatheredData.length} agent results for: ${brandName}`)

    // Run synthesis + colors in parallel
    const [research, brandColorData] = await Promise.all([
      synthesizeResearch(brandName, gatheredData, websiteData),
      extractColorsByBrandName(brandName),
    ])

    console.log(`[${requestId}] Synthesis complete. confidence=${research.confidence}, logoUrl=${brandColorData.logoUrl || 'none'}`)

    // Extract colors — priority chain
    let colors = null
    const discoveredLogoUrl = brandColorData.logoUrl

    if (discoveredLogoUrl && !discoveredLogoUrl.endsWith('.svg')) {
      try {
        colors = await extractColorsFromLogo(discoveredLogoUrl)
        console.log(`[${requestId}] Colors from discovered logo`)
      } catch {
        console.warn(`[${requestId}] Discovered logo color extraction failed, falling back`)
      }
    }

    if (!colors) {
      const websiteLogoUrl = websiteData?.logos?.primary || websiteData?.logoUrl
      if (websiteLogoUrl && !websiteLogoUrl.endsWith('.svg')) {
        try {
          colors = await extractColorsFromLogo(websiteLogoUrl)
        } catch { /* continue */ }
      }
    }

    if (!colors) {
      colors = brandColorData
    }

    const cssColors = websiteData?.dominantColors || websiteData?.cssColors
    if (!colors && cssColors?.length > 0) {
      colors = await analyzeColorPalette(cssColors)
    }

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

    console.log(`[${requestId}] Final colors: primary=${colors.primary}, accent=${colors.accent}`)

    return NextResponse.json({
      success: true,
      research,
      colors,
      logoUrl: discoveredLogoUrl || websiteData?.logos?.primary || null,
    })
  } catch (error) {
    console.error(`[${requestId}] Synthesis error:`, error)
    return NextResponse.json(
      { error: 'Synthesis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
