import type { WizardStepDataMap, WizardStepId } from '@/types/wizard'
import type { ExtractedBriefData } from '@/types/brief'

/**
 * Safely convert an array of unknown items to string[].
 * Handles objects with title/name/description fields that Gemini may return
 * instead of plain strings.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toStringArray(arr: any[]): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        return item.title || item.name || item.text || item.description || JSON.stringify(item)
      }
      return String(item)
    })
    .filter(Boolean)
}

/**
 * Convert extracted brief data to wizard step data (pre-populate steps)
 */
export function extractedDataToStepData(
  extracted: ExtractedBriefData
): Partial<WizardStepDataMap> {
  const stepData: Partial<WizardStepDataMap> = {}

  // Brief step
  if (extracted.brand?.name || extracted.brand?.background) {
    stepData.brief = {
      brandName: extracted.brand.name || '',
      brandBrief: extracted.brand.background || '',
      brandPainPoints: extracted.targetAudience?.primary?.painPoints || [],
      brandObjective: extracted.campaignGoals?.[0] || '',
      successMetrics: extracted.successMetrics || [],
      clientSpecificRequests: extracted.clientSpecificRequests || [],
    }
  }

  // Goals step
  if (extracted.campaignGoals?.length) {
    stepData.goals = {
      goals: extracted.campaignGoals.map((g) => ({ title: g, description: '' })),
      customGoals: [],
    }
  }

  // Target audience step
  if (extracted.targetAudience?.primary) {
    const ta = extracted.targetAudience
    stepData.target_audience = {
      targetGender: ta.primary.gender || '',
      targetAgeRange: ta.primary.ageRange || '',
      targetDescription: ta.primary.lifestyle || '',
      targetBehavior: ta.behavior || '',
      targetInsights: ta.primary.interests || [],
      targetSecondary: ta.secondary || undefined,
    }
  }

  // Key insight step
  if (extracted.keyInsight) {
    stepData.key_insight = {
      keyInsight: extracted.keyInsight,
      insightSource: extracted.insightSource || '',
    }
  }

  // Strategy step
  if (extracted.strategyDirection) {
    stepData.strategy = {
      strategyHeadline: extracted.strategyDirection,
      strategyPillars: [],
    }
  }

  // Creative step
  if (extracted.creativeDirection) {
    stepData.creative = {
      activityTitle: '',
      activityConcept: extracted.creativeDirection,
      activityDescription: '',
      activityApproach: [],
      referenceImages: [],
    }
  }

  // Deliverables step
  if (extracted.deliverables?.length) {
    stepData.deliverables = {
      deliverables: extracted.deliverables.map((d) => ({
        type: d.type,
        quantity: d.quantity || 1,
        description: d.description || '',
        purpose: '',
      })),
      referenceImages: [],
    }
  }

  // Media targets step
  if (extracted.budget?.amount) {
    stepData.media_targets = {
      budget: extracted.budget.amount,
      currency: extracted.budget.currency || '₪',
      potentialReach: 0,
      potentialEngagement: 0,
      cpe: 0,
    }
  }

  return stepData
}

/**
 * Convert wizard step data to flat ProposalData for the template
 */
export function wizardDataToProposalData(
  stepData: Partial<WizardStepDataMap>
): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  // Brief
  if (stepData.brief) {
    data.brandName = stepData.brief.brandName
    data.brandBrief = stepData.brief.brandBrief
    data.brandPainPoints = stepData.brief.brandPainPoints
    data.brandObjective = stepData.brief.brandObjective
    if (stepData.brief.successMetrics?.length) {
      data.successMetrics = stepData.brief.successMetrics
    }
    if (stepData.brief.clientSpecificRequests?.length) {
      data.clientSpecificRequests = stepData.brief.clientSpecificRequests
    }
  }

  // Goals
  if (stepData.goals) {
    data.goalsDetailed = stepData.goals.goals
    data.goals = stepData.goals.goals.map((g) => g.title)
    if (stepData.goals.targets?.length) {
      data.measurableTargets = stepData.goals.targets
    }
  }

  // Target audience
  if (stepData.target_audience) {
    const ta = stepData.target_audience
    data.targetGender = ta.targetGender
    data.targetAgeRange = ta.targetAgeRange
    data.targetDescription = ta.targetDescription
    data.targetBehavior = ta.targetBehavior
    data.targetInsights = ta.targetInsights
  }

  // Key insight
  if (stepData.key_insight) {
    data.keyInsight = stepData.key_insight.keyInsight
    data.insightSource = stepData.key_insight.insightSource
    data.insightData = stepData.key_insight.insightData
  }

  // Strategy
  if (stepData.strategy) {
    data.strategyHeadline = stepData.strategy.strategyHeadline
    data.strategyDescription = stepData.strategy.strategyDescription
    data.strategyPillars = stepData.strategy.strategyPillars
    data.strategyFlow = stepData.strategy.strategyFlow
  }

  // Creative
  if (stepData.creative) {
    data.activityTitle = stepData.creative.activityTitle
    data.activityConcept = stepData.creative.activityConcept
    data.activityDescription = stepData.creative.activityDescription
    data.activityApproach = stepData.creative.activityApproach
    data.activityDifferentiator = stepData.creative.activityDifferentiator
    data.creativeSlides = [{
      title: stepData.creative.activityTitle,
      description: stepData.creative.activityDescription,
      referenceImages: stepData.creative.referenceImages?.map((r) => r.url),
    }]
  }

  // Deliverables
  if (stepData.deliverables) {
    data.deliverablesDetailed = stepData.deliverables.deliverables
    data.deliverables = stepData.deliverables.deliverables.map((d) => d.type)
    data.deliverablesSummary = stepData.deliverables.deliverablesSummary
  }

  // Quantities
  if (stepData.quantities) {
    data.quantitiesSummary = stepData.quantities
  }

  // Media targets
  if (stepData.media_targets) {
    const mt = stepData.media_targets
    data.budget = mt.budget
    data.currency = mt.currency
    data.potentialReach = mt.potentialReach
    data.potentialEngagement = mt.potentialEngagement
    data.cpe = mt.cpe
    data.cpm = mt.cpm
    data.estimatedImpressions = mt.estimatedImpressions
    data.metricsExplanation = mt.metricsExplanation
  }

  // Influencers
  if (stepData.influencers) {
    data.enhancedInfluencers = stepData.influencers.influencers
    data.influencerStrategy = stepData.influencers.influencerStrategy
    data.influencerCriteria = stepData.influencers.influencerCriteria
    data.influencerNote = stepData.influencers.influencerNote
  }

  // Research
  if (stepData.research?.brandResearch) {
    data._brandResearch = stepData.research.brandResearch
  }
  if (stepData.research?.influencerStrategy) {
    data._influencerStrategy = stepData.research.influencerStrategy
    // Also map to influencerResearch so slide-designer can find recommendations
    data.influencerResearch = stepData.research.influencerStrategy
    // Fill influencer criteria/guidelines from research if not set by user
    if (!data.influencerCriteria && stepData.research.influencerStrategy.contentThemes?.length) {
      data.influencerCriteria = stepData.research.influencerStrategy.contentThemes.map(
        (t: { theme?: string } | string) => typeof t === 'string' ? t : t.theme || ''
      ).filter(Boolean)
    }
    if (!data.influencerStrategy && stepData.research.influencerStrategy.strategySummary) {
      data.influencerStrategy = stepData.research.influencerStrategy.strategySummary
    }
  }
  if (stepData.research?.brandColors) {
    data._brandColors = stepData.research.brandColors
  }

  return data
}

/**
 * Enrich step data with brand research and influencer strategy.
 * Research data OVERRIDES basic proposal-agent data because research
 * is based on actual brand analysis (more accurate than AI guesses).
 */
export function enrichStepData(
  baseStepData: Partial<WizardStepDataMap>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  brandResearch?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  influencerStrategy?: any,
): Partial<WizardStepDataMap> {
  if (!brandResearch && !influencerStrategy) return baseStepData

  const result = { ...baseStepData }

  // ═══ CRITICAL: Store raw research for wizardDataToProposalData() ═══
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(result as any).research = {
    brandResearch: brandResearch || (result as any).research?.brandResearch || null,
    influencerStrategy: influencerStrategy || (result as any).research?.influencerStrategy || null,
    brandColors: null, // set by research page separately
  }

  // ─────────────────────────────────────────────────────────────────────
  // BRAND RESEARCH enrichment
  // ─────────────────────────────────────────────────────────────────────
  if (brandResearch) {
    // ── Brief ──
    if (result.brief) {
      // Override brandBrief only if research description is richer (longer)
      if (brandResearch.companyDescription &&
          brandResearch.companyDescription.length > (result.brief.brandBrief?.length || 0)) {
        result.brief = { ...result.brief, brandBrief: brandResearch.companyDescription }
      }
      // Pain points: research is always more factual than proposal-agent guesses
      if (brandResearch.targetDemographics?.primaryAudience?.painPoints?.length) {
        result.brief = { ...result.brief, brandPainPoints: toStringArray(brandResearch.targetDemographics.primaryAudience.painPoints) }
      }
      // Objective: enrich if empty with market positioning context
      if (!result.brief.brandObjective && brandResearch.marketPosition) {
        result.brief = {
          ...result.brief,
          brandObjective: `לחזק את עמדת ${result.brief.brandName || 'המותג'} כ${brandResearch.marketPosition} באמצעות קמפיין משפיענים ממוקד`,
        }
      }
    }

    // ── Target Audience ──
    if (result.target_audience) {
      if (brandResearch.targetDemographics?.primaryAudience?.lifestyle) {
        result.target_audience = { ...result.target_audience, targetDescription: brandResearch.targetDemographics.primaryAudience.lifestyle }
      }
      if (brandResearch.targetDemographics?.behavior) {
        result.target_audience = { ...result.target_audience, targetBehavior: brandResearch.targetDemographics.behavior }
      }
      if (brandResearch.targetDemographics?.primaryAudience?.interests?.length) {
        result.target_audience = { ...result.target_audience, targetInsights: toStringArray(brandResearch.targetDemographics.primaryAudience.interests) }
      }
    }

    // ── Goals: enrich empty descriptions with USPs from research ──
    if (result.goals?.goals?.length && brandResearch.uniqueSellingPoints?.length) {
      const usps = toStringArray(brandResearch.uniqueSellingPoints)
      result.goals = {
        ...result.goals,
        goals: result.goals.goals.map((goal, i) => ({
          ...goal,
          // Only fill if description is missing or very short (< 20 chars = placeholder)
          description: (goal.description && goal.description.length > 20)
            ? goal.description
            : (usps[i % usps.length] || goal.description),
        })),
      }
    }

    // ── Key Insight: enrich insightData and insightSource from research facts ──
    if (result.key_insight) {
      const painPoints = toStringArray(brandResearch.targetDemographics?.primaryAudience?.painPoints || [])
      // insightData = competitive gap or pain point (competitive gap is more strategic)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const competitiveGap = (brandResearch as any).competitiveGap as string | undefined
      if (!result.key_insight.insightData && competitiveGap) {
        result.key_insight = { ...result.key_insight, insightData: competitiveGap }
      } else if (!result.key_insight.insightData && painPoints.length) {
        result.key_insight = { ...result.key_insight, insightData: painPoints[0] }
      }
      // insightSource = "why now" trigger is most specific; fall back to market position
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const whyNowTrigger = (brandResearch as any).whyNowTrigger as string | undefined
      if (!result.key_insight.insightSource && whyNowTrigger) {
        result.key_insight = { ...result.key_insight, insightSource: whyNowTrigger }
      } else if (!result.key_insight.insightSource && brandResearch.marketPosition) {
        result.key_insight = {
          ...result.key_insight,
          insightSource: `ניתוח עמדת שוק: ${brandResearch.marketPosition}`,
        }
      }
    }

    // ── Strategy ──
    if (result.strategy) {
      // Build a rich description: israeliMarketContext + market context
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const israeliContext = (brandResearch as any).israeliMarketContext as string | undefined
      if (!result.strategy.strategyDescription) {
        const contextParts = [
          israeliContext,
          brandResearch.marketPosition,
          brandResearch.pricePositioning,
        ].filter(Boolean) as string[]
        if (contextParts.length) {
          result.strategy = { ...result.strategy, strategyDescription: contextParts.join('. ') }
        }
      } else if (israeliContext && typeof result.strategy.strategyDescription === 'string' && !result.strategy.strategyDescription.includes(israeliContext.slice(0, 20))) {
        // Append Israeli market context if not already included and description is short
        if (result.strategy.strategyDescription.length < 250) {
          result.strategy = {
            ...result.strategy,
            strategyDescription: `${result.strategy.strategyDescription}. ${israeliContext}`,
          }
        }
      }

      // Enrich pillar DESCRIPTIONS (not titles) with content themes — preserve creative titles
      if (brandResearch.contentThemes?.length) {
        const themes = toStringArray(brandResearch.contentThemes)
        if (result.strategy.strategyPillars?.length) {
          result.strategy = {
            ...result.strategy,
            strategyPillars: result.strategy.strategyPillars.map((pillar, i) => ({
              ...pillar,
              // Only fill description if missing or very short
              description: (pillar.description && pillar.description.length > 10)
                ? pillar.description
                : (themes[i] || pillar.description),
            })),
          }
        } else {
          // No pillars yet — create from themes
          result.strategy = {
            ...result.strategy,
            strategyPillars: themes.slice(0, 3).map(theme => ({ title: theme, description: '' })),
          }
        }
      }
    }

    // ── Strategy: add competitor campaign opportunities to strategyFlow (if not set) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const competitorCampaigns = (brandResearch as any).competitorCampaigns as Array<{
      competitorName?: string; opportunityForBrand?: string
    }> | undefined
    if (result.strategy && !result.strategy.strategyFlow && competitorCampaigns?.length) {
      const opportunities = competitorCampaigns
        .filter(c => c.opportunityForBrand)
        .map(c => c.opportunityForBrand!)
        .slice(0, 3)
      if (opportunities.length) {
        result.strategy = {
          ...result.strategy,
          strategyFlow: {
            steps: opportunities.map(opp => ({ label: 'הזדמנות תחרותית', description: opp })),
          },
        }
      }
    }

    // ── Creative: enrich with suggested references from research ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visualReferences = (brandResearch as any).visualReferences as Array<{
      type?: string; description?: string; rationale?: string
    }> | undefined
    if (visualReferences?.length && result.creative) {
      result.creative = {
        ...result.creative,
        suggestedReferences: visualReferences.map(ref => ({
          type: ref.type || 'רפרנס',
          description: ref.description || '',
          rationale: ref.rationale || '',
        })),
      }
    }

    // ── Brief: enrich with Israeli market context if brandBrief is thin ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const israeliContext = (brandResearch as any).israeliMarketContext as string | undefined
    if (result.brief && israeliContext) {
      const currentBrief = (typeof result.brief.brandBrief === 'string' ? result.brief.brandBrief : '') || ''
      if (currentBrief.length < 300 && !currentBrief.includes(israeliContext.slice(0, 20))) {
        result.brief = {
          ...result.brief,
          brandBrief: currentBrief ? `${currentBrief}\n\n${israeliContext}` : israeliContext,
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // INFLUENCER STRATEGY enrichment
  // ─────────────────────────────────────────────────────────────────────
  if (influencerStrategy) {
    // ── Influencers ──
    if (result.influencers) {
      if (influencerStrategy.recommendations?.length) {
        result.influencers = {
          ...result.influencers,
          influencers: influencerStrategy.recommendations.slice(0, 6).map((rec: {
            name?: string; handle?: string; category?: string; followers?: string
            engagement?: string; whyRelevant?: string; contentStyle?: string
          }) => ({
            name: rec.name || '',
            username: rec.handle?.replace('@', '') || '',
            profileUrl: rec.handle ? `https://instagram.com/${rec.handle.replace('@', '')}` : '',
            profilePicUrl: '',
            categories: rec.category ? [rec.category] : [],
            followers: parseFollowerCount(rec.followers || '0'),
            engagementRate: parseFloat(rec.engagement?.replace('%', '') || '0'),
            bio: rec.whyRelevant || '',
          })),
        }
      }
      if (influencerStrategy.strategySummary) {
        result.influencers = { ...result.influencers, influencerStrategy: influencerStrategy.strategySummary }
      }
      // Influencer criteria from content themes if not set
      if (!result.influencers.influencerCriteria?.length && influencerStrategy.contentThemes?.length) {
        result.influencers = {
          ...result.influencers,
          influencerCriteria: toStringArray(influencerStrategy.contentThemes).filter(Boolean),
        }
      }
    }

    // ── Influencers: add dominant platform context from brand research ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dominantPlatform = (brandResearch as any)?.dominantPlatformInIsrael as string | undefined
    if (result.influencers && dominantPlatform) {
      const note = `פלטפורמה מובילה בישראל לקהל זה: ${dominantPlatform}`
      const existing = (typeof result.influencers.influencerNote === 'string' ? result.influencers.influencerNote : '') || ''
      if (!existing.includes(dominantPlatform)) {
        result.influencers = {
          ...result.influencers,
          influencerNote: existing ? `${existing}. ${note}` : note,
        }
      }
    }

    // ── Quantities: FIX — use recommendedCount (was incorrectly t.count) ──
    if (result.quantities && influencerStrategy.tiers?.length) {
      const totalFromTiers = influencerStrategy.tiers.reduce(
        (sum: number, t: { recommendedCount?: number; count?: number }) =>
          sum + (t.recommendedCount ?? t.count ?? 0),
        0
      )
      if (totalFromTiers > 0) {
        result.quantities = { ...result.quantities, influencerCount: totalFromTiers }
      }
    }

    // ── Media Targets: FIX — fuzzy Hebrew + English KPI matching (was exact English-only) ──
    if (result.media_targets && influencerStrategy.expectedKPIs?.length) {
      for (const kpi of influencerStrategy.expectedKPIs) {
        if (!kpi.target) continue
        const m = (kpi.metric || '').toLowerCase()
        if (m.includes('reach') || m.includes('חשיפה') || m.includes('הגעה')) {
          result.media_targets = { ...result.media_targets, potentialReach: parseNumericTarget(kpi.target) }
        } else if (m.includes('engagement') || m.includes('מעורבות') || m.includes('אינגייג')) {
          result.media_targets = { ...result.media_targets, potentialEngagement: parseNumericTarget(kpi.target) }
        } else if (m.includes('cpe') || m.includes('עלות למעורבות') || m.includes('cost per')) {
          const parsed = parseFloat(kpi.target.replace(/[^0-9.]/g, ''))
          if (parsed > 0) result.media_targets = { ...result.media_targets, cpe: parsed }
        } else if (m.includes('impression') || m.includes('חשיפות') || m.includes('נוכחות')) {
          result.media_targets = { ...result.media_targets, estimatedImpressions: parseNumericTarget(kpi.target) }
        }
      }
    }
  }

  return result
}

function parseFollowerCount(str: string): number {
  const clean = str.replace(/[,\s]/g, '').toLowerCase()
  if (clean.endsWith('m')) return parseFloat(clean) * 1_000_000
  if (clean.endsWith('k')) return parseFloat(clean) * 1_000
  return parseInt(clean) || 0
}

function parseNumericTarget(str: string): number {
  const clean = str.replace(/[,\s]/g, '').toLowerCase()
  if (clean.endsWith('m')) return parseFloat(clean) * 1_000_000
  if (clean.endsWith('k')) return parseFloat(clean) * 1_000
  return parseInt(clean) || 0
}

/**
 * Validate step data - returns errors or null
 */
export function validateStep(
  stepId: WizardStepId,
  data: unknown
): Record<string, string> | null {
  const d = data as Record<string, unknown>
  if (!d) return { _form: 'נדרש למלא נתונים' }

  const errors: Record<string, string> = {}

  switch (stepId) {
    case 'brief':
      if (!d.brandName) errors.brandName = 'שם המותג נדרש'
      if (!d.brandBrief) errors.brandBrief = 'רקע על המותג נדרש'
      break
    case 'goals':
      if (!d.goals || !(d.goals as unknown[]).length) errors.goals = 'נדרשת לפחות מטרה אחת'
      break
    case 'target_audience':
      if (!d.targetGender) errors.targetGender = 'נדרש מגדר קהל יעד'
      if (!d.targetAgeRange) errors.targetAgeRange = 'נדרש טווח גילאים'
      break
    case 'key_insight':
      if (!d.keyInsight) errors.keyInsight = 'נדרשת תובנה'
      break
    case 'strategy':
      if (!d.strategyHeadline) errors.strategyHeadline = 'נדרשת כותרת אסטרטגיה'
      break
    case 'deliverables':
      if (!d.deliverables || !(d.deliverables as unknown[]).length)
        errors.deliverables = 'נדרש לפחות תוצר אחד'
      break
    case 'quantities':
      if (!d.influencerCount) errors.influencerCount = 'נדרש מספר משפיענים'
      break
    case 'media_targets':
      if (!d.budget) errors.budget = 'נדרש תקציב'
      break
    case 'influencers':
      // Influencers can be empty at this stage
      break
    case 'creative':
    case 'research':
      // Optional steps - always valid
      return null
  }

  return Object.keys(errors).length > 0 ? errors : null
}
