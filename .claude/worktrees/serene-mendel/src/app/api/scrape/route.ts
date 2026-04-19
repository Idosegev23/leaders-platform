import { NextRequest, NextResponse } from 'next/server'
import { fetchScrape } from '@/lib/apify/fetch-scraper'
import { validateExternalUrl } from '@/lib/utils/url-validator'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'

export const maxDuration = 600

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // SSRF protection — block internal/private URLs
    let validatedUrl: string
    try {
      validatedUrl = validateExternalUrl(url)
    } catch {
      return NextResponse.json({ error: 'Invalid or blocked URL' }, { status: 400 })
    }

    console.log(`[API Scrape] Scraping ${validatedUrl}`)

    try {
      const scrapedData = await fetchScrape(validatedUrl)
      console.log(`[API Scrape] Done - logo=${!!scrapedData.logoUrl}, ${scrapedData.allImages.length} images, ${scrapedData.colorPalette.length} colors`)

      return NextResponse.json({
        success: true,
        data: scrapedData,
        enhanced: true,
      })
    } catch (fetchError) {
      console.error('[API Scrape] Fetch scraper failed:', fetchError)
    }

    // Scraper failed → return empty
    return emptyResponse(url)
  } catch (error) {
    console.error('[API Scrape] Error:', error)
    return emptyResponse('')
  }
}

function emptyResponse(url: string) {
  console.log('[API Scrape] Returning empty result')
  return NextResponse.json({
    success: true,
    data: {
      url: url || '',
      title: '',
      description: '',
      screenshot: null,
      logoUrl: null,
      logoAlternatives: [],
      favicon: null,
      ogImage: null,
      heroImages: [],
      productImages: [],
      lifestyleImages: [],
      allImages: [],
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      colorPalette: [],
      headings: { h1: [], h2: [], h3: [] },
      paragraphs: [],
      tagline: null,
      aboutText: null,
      socialLinks: {},
      emails: [],
      phones: [],
      address: null,
      metaKeywords: [],
      metaDescription: '',
    },
    enhanced: true,
    scraperBlocked: true,
  })
}
