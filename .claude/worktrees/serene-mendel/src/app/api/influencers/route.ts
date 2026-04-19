import { NextRequest, NextResponse } from 'next/server'
import { scrapeMultipleInfluencers } from '@/lib/apify/influencer-scraper'

export const maxDuration = 600
import { researchInfluencers } from '@/lib/gemini/influencer-research'
import type { BrandResearch } from '@/lib/gemini/brand-research'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { 
      brandResearch, 
      budget, 
      goals,
      usernames,
      mode = 'discover' // 'discover' | 'scrape' | 'research'
    } = body as {
      brandResearch?: BrandResearch
      budget?: number
      goals?: string[]
      usernames?: string[]
      mode?: 'discover' | 'scrape' | 'research'
    }
    
    console.log(`[API Influencers] Mode: ${mode}`)
    
    // Mode: Scrape specific usernames
    if (mode === 'scrape' && usernames && usernames.length > 0) {
      console.log(`[API Influencers] Scraping ${usernames.length} specific profiles`)
      const scraped = await scrapeMultipleInfluencers(usernames)
      
      // Filter: Only include influencers with 10K+ followers
      const filteredScraped = scraped.filter(inf => inf.followers >= 10000)
      console.log(`[API Influencers] Filtered to ${filteredScraped.length} influencers with 10K+ followers`)
      
      return NextResponse.json({
        success: true,
        influencers: filteredScraped,
        count: filteredScraped.length,
      })
    }
    
    // Mode: AI research only (no scraping)
    if (mode === 'research' && brandResearch && budget && goals) {
      console.log('[API Influencers] AI research only')
      const strategy = await researchInfluencers(brandResearch, budget, goals)
      
      return NextResponse.json({
        success: true,
        strategy,
        recommendations: strategy.recommendations,
      })
    }
    
    // Mode: Full discovery - AI research + scrape recommended profiles
    // Note: budget can be 0 (falsy) — check explicitly for brandResearch only
    if (mode === 'discover' && brandResearch) {
      console.log('[API Influencers] Full discovery mode (AI research + profile scraping)')

      // Step 1: Get AI recommendations
      const strategy = await researchInfluencers(brandResearch, budget ?? 0, goals ?? [])
      console.log(`[API Influencers] AI recommended ${strategy.recommendations?.length || 0} influencers`)

      // Step 2: Scrape profiles from AI recommendations
      const handles = (strategy.recommendations || [])
        .slice(0, 8)
        .map((rec: { handle?: string }) => rec.handle?.replace('@', '').trim())
        .filter(Boolean) as string[]

      let scrapedInfluencers: Awaited<ReturnType<typeof scrapeMultipleInfluencers>> = []
      if (handles.length > 0) {
        scrapedInfluencers = await scrapeMultipleInfluencers(handles)
        console.log(`[API Influencers] Scraped ${scrapedInfluencers.length} profiles from AI recommendations`)
      }

      const filteredScraped = scrapedInfluencers.filter(inf => inf.followers >= 10000)

      return NextResponse.json({
        success: true,
        strategy,
        recommendations: strategy.recommendations,
        scrapedInfluencers: filteredScraped,
        combinedCount: filteredScraped.length + (strategy.recommendations?.length || 0),
      })
    }
    
    return NextResponse.json(
      { error: 'Missing required parameters for the selected mode' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('[API Influencers] Error:', error)
    return NextResponse.json(
      { error: 'Failed to process influencer request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}


