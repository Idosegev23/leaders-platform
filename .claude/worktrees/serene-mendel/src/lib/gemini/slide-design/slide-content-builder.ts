/**
 * Slide content builder — transforms proposal data into SlideContentInput arrays.
 */

import type {
  SlideContentInput,
  InfluencerResearchData,
  PremiumProposalData,
} from './types'
import { getBatchSize } from './config-loaders'

/** Remove empty/null/undefined/[] fields so the AI prompt isn't cluttered */
export function cleanContent(content: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(content)) {
    if (v === '' || v === null || v === undefined) continue
    if (Array.isArray(v) && v.length === 0) continue
    cleaned[k] = v
  }
  return cleaned
}

/** Split an array into chunks of max size */
export function chunkByMax<T>(arr: T[], max: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += max) {
    chunks.push(arr.slice(i, i + max))
  }
  return chunks
}

export function formatNum(n?: number): string {
  if (!n) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}K`
  return n.toString()
}

export async function buildSlideBatches(
  data: PremiumProposalData,
  config: {
    images?: { coverImage?: string; brandImage?: string; audienceImage?: string; activityImage?: string }
    extraImages?: { id: string; url: string; placement: string }[]
  } = {},
): Promise<SlideContentInput[][]> {
  const currency = data.currency === 'USD' ? '$' : data.currency === 'EUR' ? '€' : '₪'
  const br = data._brandResearch || {}
  const ir = data._influencerStrategy || data.influencerResearch || {} as InfluencerResearchData

  const extraByPlacement: Record<string, string> = {}
  for (const img of config.extraImages || []) {
    if (img.url && img.placement) extraByPlacement[img.placement] = img.url
  }

  const allSlides: SlideContentInput[] = []

  // 1. Cover
  allSlides.push({ slideType: 'cover', title: 'שער', imageUrl: config.images?.coverImage, content: cleanContent({
    brandName: data.brandName,
    campaignSubtitle: data.campaignSubtitle || data.strategyHeadline || 'הצעת שיתוף פעולה',
    issueDate: data.issueDate || new Date().toLocaleDateString('he-IL'),
    industry: br.industry,
    tagline: br.brandPromise,
  }) })

  // 2. Brief
  allSlides.push({ slideType: 'brief', title: 'למה התכנסנו?', imageUrl: config.images?.brandImage, content: cleanContent({
    headline: 'למה התכנסנו?',
    brandBrief: data.brandBrief,
    painPoints: data.brandPainPoints,
    objective: data.brandObjective,
    successMetrics: data.successMetrics,
    clientRequests: data.clientSpecificRequests,
    companyDescription: br.companyDescription,
    brandValues: br.brandValues,
    whyNow: br.whyNowTrigger,
  }) })

  // 3. Goals
  allSlides.push({ slideType: 'goals', title: 'מטרות הקמפיין', imageUrl: extraByPlacement['goals'], content: cleanContent({
    headline: 'מטרות הקמפיין',
    goals: data.goalsDetailed || (data.goals || []).map(g => ({ title: g, description: '' })),
    measurableTargets: data.measurableTargets,
    successMetrics: data.successMetrics,
  }) })

  // 4. Audience
  allSlides.push({ slideType: 'audience', title: 'קהל היעד', imageUrl: config.images?.audienceImage, content: cleanContent({
    headline: 'קהל היעד',
    gender: data.targetGender,
    ageRange: data.targetAgeRange,
    description: data.targetDescription,
    behavior: data.targetBehavior,
    insights: data.targetInsights,
    researchDemographics: br.targetDemographics?.primaryAudience,
    purchaseDrivers: br.targetDemographics?.purchaseDrivers,
  }) })

  // 5. Insight
  allSlides.push({ slideType: 'insight', title: 'התובנה המרכזית', imageUrl: extraByPlacement['insight'], content: cleanContent({
    headline: 'התובנה המרכזית',
    keyInsight: data.keyInsight,
    source: data.insightSource,
    data: data.insightData,
    israeliMarketContext: br.israeliMarketContext,
    industryTrends: (br.industryTrends || []).slice(0, 3),
  }) })

  // 6. (Conditional) Why Now
  const hasWhyNow = br.whyNowTrigger || (br.industryTrends && br.industryTrends.length > 0)
  if (hasWhyNow) {
    allSlides.push({ slideType: 'whyNow', title: 'למה עכשיו?', imageUrl: extraByPlacement['whyNow'], content: cleanContent({
      headline: 'למה עכשיו?',
      whyNowTrigger: br.whyNowTrigger,
      industryTrends: br.industryTrends,
      israeliMarketContext: br.israeliMarketContext,
    }) })
  }

  // 7. Strategy
  allSlides.push({ slideType: 'strategy', title: 'האסטרטגיה', imageUrl: extraByPlacement['strategy'], content: cleanContent({
    headline: 'האסטרטגיה',
    strategyHeadline: data.strategyHeadline,
    description: data.strategyDescription,
    pillars: data.strategyPillars,
    flow: data.strategyFlow as unknown,
    competitiveGap: br.competitiveGap,
  }) })

  // 8. (Conditional) Competitive Landscape
  const competitors = br.competitors || []
  if (competitors.length >= 2) {
    allSlides.push({ slideType: 'competitive', title: 'נוף תחרותי', content: cleanContent({
      headline: 'נוף תחרותי',
      competitors: competitors.slice(0, 5).map(c => ({ name: c.name, description: c.description })),
      marketPosition: br.marketPosition,
      competitiveAdvantages: br.competitiveAdvantages,
      usp: (br.uniqueSellingPoints || []).slice(0, 3),
      competitiveGap: br.competitiveGap,
    }) })
  }

  // 9. Big Idea
  allSlides.push({ slideType: 'bigIdea', title: 'הרעיון המרכזי', imageUrl: config.images?.activityImage || config.images?.brandImage, content: cleanContent({
    headline: data.activityTitle || 'הרעיון המרכזי',
    concept: data.activityConcept,
    description: data.activityDescription,
    differentiator: data.activityDifferentiator,
    brandPersonality: br.brandPersonality,
  }) })

  // 10. Approach
  allSlides.push({ slideType: 'approach', title: 'הגישה שלנו', imageUrl: extraByPlacement['approach'], content: cleanContent({
    headline: 'הגישה שלנו',
    approaches: data.activityApproach,
    differentiator: data.activityDifferentiator,
    contentThemes: (ir.contentThemes || []).slice(0, 4),
  }) })

  // 11. Deliverables
  const quantitiesSummary = data.quantitiesSummary as { campaignDurationMonths?: number; totalDeliverables?: number } | undefined
  allSlides.push({ slideType: 'deliverables', title: 'תוצרים', content: cleanContent({
    headline: 'תוצרים',
    deliverables: data.deliverablesDetailed || (data.deliverables || []).map(d => ({ type: d, quantity: 1, description: '' })),
    summary: data.deliverablesSummary,
    campaignDuration: quantitiesSummary?.campaignDurationMonths ? `${quantitiesSummary.campaignDurationMonths} חודשים` : undefined,
    totalDeliverables: quantitiesSummary?.totalDeliverables,
  }) })

  // 12. Metrics
  allSlides.push({ slideType: 'metrics', title: 'יעדים ומדדים', content: cleanContent({
    headline: 'יעדים ומדדים',
    budget: data.budget ? `${currency}${formatNum(data.budget)}` : undefined,
    reach: formatNum(data.potentialReach),
    engagement: formatNum(data.potentialEngagement),
    impressions: formatNum(data.estimatedImpressions),
    cpe: data.cpe ? `${currency}${data.cpe.toFixed(1)}` : undefined,
    cpm: data.cpm ? `${currency}${data.cpm.toFixed(1)}` : undefined,
    explanation: data.metricsExplanation,
    successMetrics: data.successMetrics,
    measurableTargets: data.measurableTargets,
    expectedKPIs: (ir.expectedKPIs || []).slice(0, 5),
  }) })

  // 13. Influencer Strategy
  allSlides.push({ slideType: 'influencerStrategy', title: 'אסטרטגיית משפיענים', content: cleanContent({
    headline: 'אסטרטגיית משפיענים',
    strategy: data.influencerStrategy || ir.strategySummary,
    criteria: data.influencerCriteria || (ir.contentThemes || []).map((t: { theme?: string }) => t.theme).filter(Boolean),
    guidelines: data.contentGuidelines,
    tiers: (ir.tiers || []).map(t => ({ name: t.name, description: t.description, count: t.recommendedCount })),
    timelinePhases: (ir.suggestedTimeline || []).map(t => ({ phase: t.phase, duration: t.duration, activities: t.activities })),
  }) })

  // 14. (Conditional) Content Strategy
  const hasContentStrategy = (ir.contentThemes || []).length >= 2 || (ir.tiers || []).length >= 2
  if (hasContentStrategy) {
    allSlides.push({ slideType: 'contentStrategy', title: 'אסטרטגיית תוכן', content: cleanContent({
      headline: 'אסטרטגיית תוכן',
      contentThemes: (ir.contentThemes || []).slice(0, 5).map(t => ({ theme: t.theme, description: t.description })),
      tiers: (ir.tiers || []).map(t => ({ name: t.name, description: t.description, count: t.recommendedCount, budgetAllocation: t.budgetAllocation })),
      dominantPlatform: br.dominantPlatformInIsrael,
    }) })
  }

  // 15. Influencers (conditional)
  const influencers = data.enhancedInfluencers || data.scrapedInfluencers?.map(i => ({
    name: i.name || i.username || '', username: i.username || '', profilePicUrl: i.profilePicUrl || '',
    categories: [] as string[], followers: i.followers || 0, engagementRate: i.engagementRate || 0,
  })) || []
  const aiRecs = ir.recommendations || []

  if (influencers.length > 0 || aiRecs.length > 0) {
    allSlides.push({
      slideType: 'influencers', title: 'משפיענים מומלצים',
      content: cleanContent({
        headline: 'משפיענים מומלצים',
        influencers: influencers.slice(0, 6).map(inf => ({ name: inf.name, username: inf.username, profilePicUrl: inf.profilePicUrl, followers: formatNum(inf.followers), engagementRate: `${inf.engagementRate?.toFixed(1) || '0'}%`, categories: inf.categories?.join(', ') || '' })),
        aiRecommendations: aiRecs.slice(0, 6).map((rec: { name?: string; handle?: string; followers?: string; engagement?: string; whyRelevant?: string; profilePicUrl?: string }) => ({ name: rec.name || '', handle: rec.handle || '', followers: rec.followers || '', engagement: rec.engagement || '', reason: rec.whyRelevant || '', profilePicUrl: rec.profilePicUrl || '' })),
      }),
    })
  }

  // 16. (Conditional) Timeline
  const hasTimeline = (data.measurableTargets || []).length > 0 || (ir.suggestedTimeline || []).length > 0
  if (hasTimeline) {
    allSlides.push({ slideType: 'timeline', title: 'מפת דרכים', content: cleanContent({
      headline: 'מפת דרכים',
      measurableTargets: data.measurableTargets,
      timelinePhases: (ir.suggestedTimeline || []).map(t => ({ phase: t.phase, duration: t.duration, activities: t.activities })),
      campaignDuration: quantitiesSummary?.campaignDurationMonths ? `${quantitiesSummary.campaignDurationMonths} חודשים` : undefined,
      expectedKPIs: (ir.expectedKPIs || []).slice(0, 4),
    }) })
  }

  // 17. Closing (always last)
  allSlides.push({ slideType: 'closing', title: 'סיום', content: cleanContent({
    brandName: data.brandName || '',
    headline: 'בואו ניצור ביחד',
    subheadline: `נשמח להתחיל לעבוד עם ${data.brandName}`,
  }) })

  const batchSize = await getBatchSize()
  return chunkByMax(allSlides, batchSize)
}
