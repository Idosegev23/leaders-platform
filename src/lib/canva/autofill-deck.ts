// src/lib/canva/autofill-deck.ts
import { createClient } from '@supabase/supabase-js'
import { callAI, resolveModels } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import {
  autofillFromBrandTemplate,
  buildAutofillData,
  getBrandTemplateDataset,
  type AutofillFieldValue,
} from './brand-templates'
import type {
  BriefStepData,
  CreativeStepData,
  GoalsStepData,
  InfluencersStepData,
  KeyInsightStepData,
  MediaTargetsStepData,
  ResearchStepData,
  StrategyStepData,
  TargetAudienceStepData,
} from '@/types/wizard'

/**
 * The AI mapping bridge: document (_stepData from the auto pipeline / wizard)
 * → the ~86 autofill fields of the creative-strategy brand template
 * (EAHS1dR01Sw) → native, fully-editable Canva deck.
 *
 * Split of responsibilities:
 *  - DETERMINISTIC (code): influencer names/stats/photos, client logo,
 *    cover/about/audience images, total budget — numbers and URLs are never
 *    left to the model.
 *  - AI (one JSON call): the narrative Hebrew fields — about, goals, audiences,
 *    values, competitors, challenge, insight, strategy, direction, idea, and
 *    the budget breakdown (constrained to sum to the known total).
 *
 * Fields with no source data are OMITTED (not sent) so a designer clearing the
 * template placeholder stays authoritative — we never fill garbage.
 */

export const CREATIVE_DECK_TEMPLATE_ID =
  process.env.CANVA_CREATIVE_TEMPLATE_ID || 'EAHS1dR01Sw'

export interface NativeDeckResult {
  designId: string
  editUrl: string
  viewUrl: string
  templateId: string
  filledFields: number
  droppedFields: string[]
}

// ─── Small helpers ─────────────────────────────────────

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Same 3-shape resolution as wizard-contract: root key / _stepData / _wizardState.stepData */
function getStep<T>(wd: Rec, stepId: string): Partial<T> {
  if (isRec(wd[stepId])) return wd[stepId] as Partial<T>
  if (isRec(wd._stepData) && isRec((wd._stepData as Rec)[stepId])) {
    return (wd._stepData as Rec)[stepId] as Partial<T>
  }
  const ws = wd._wizardState
  if (isRec(ws) && isRec(ws.stepData) && isRec((ws.stepData as Rec)[stepId])) {
    return (ws.stepData as Rec)[stepId] as Partial<T>
  }
  return {}
}

function fmtCount(n: number | undefined): string | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`
  return String(n)
}

function fmtMoney(n: number | undefined, currency = 'ILS'): string | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined
  const sym = /USD|\$/i.test(currency) ? '$' : /EUR|€/i.test(currency) ? '€' : '₪'
  return `${n.toLocaleString('en-US')} ${sym}`
}

function firstImageForSlideTypes(data: Rec, types: string[]): string | undefined {
  const slides = data._agentSlides as Array<{ slideType?: string; content?: Rec }> | undefined
  if (!Array.isArray(slides)) return undefined
  for (const t of types) {
    const hit = slides.find(
      (s) => s.slideType === t && typeof s.content?.imageUrl === 'string' && (s.content.imageUrl as string).startsWith('http'),
    )
    if (hit) return hit.content!.imageUrl as string
  }
  return undefined
}

// ─── Deterministic mapping ─────────────────────────────

function mapDeterministicFields(data: Rec): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (key: string, value: string | undefined) => {
    if (value && value.trim()) out[key] = value.trim()
  }

  const brandAssets = data._brandAssets as { logo?: { url?: string } } | undefined
  const scraped = data._scraped as { logoUrl?: string } | undefined
  put('client_logo', brandAssets?.logo?.url || scraped?.logoUrl)
  put('cover_image', firstImageForSlideTypes(data, ['cover']))
  put('about_image', firstImageForSlideTypes(data, ['about', 'brand', 'intro']))
  put('audience_image', firstImageForSlideTypes(data, ['audience', 'target_audience', 'targetAudience']))

  const influencers = getStep<InfluencersStepData>(data, 'influencers').influencers ?? []
  influencers.slice(0, 4).forEach((inf, i) => {
    put(`alist${i + 1}_name`, inf.name)
    put(`alist${i + 1}_photo`, inf.profilePicUrl)
  })
  influencers.slice(0, 2).forEach((inf, i) => {
    const p = `inf${i + 1}`
    put(`${p}_name`, inf.name)
    put(`${p}_photo`, inf.profilePicUrl)
    put(`${p}_followers`, fmtCount(inf.followers))
    put(`${p}_story_views`, fmtCount(inf.avgStoryViews))
    put(`${p}_reel_views`, fmtCount(inf.avgReelViews))
    if (typeof inf.engagementRate === 'number' && inf.engagementRate > 0) {
      // engagementRate may arrive as fraction (0.021) or percent (2.1)
      const pct = inf.engagementRate < 1 ? inf.engagementRate * 100 : inf.engagementRate
      put(`${p}_er`, `${pct.toFixed(2)}%`)
    }
  })

  const media = getStep<MediaTargetsStepData>(data, 'media_targets')
  put('total_amount', fmtMoney(media.budget, media.currency))

  return out
}

// ─── AI narrative mapping ──────────────────────────────

const AI_TEXT_FIELDS = [
  'campaign_title', 'about_brand',
  'goal1', 'goal2', 'goal3',
  'audience_intro', 'audience1', 'audience2', 'audience3', 'audience4', 'audience5', 'audience6',
  'value1', 'value2', 'value3',
  'comp1_name', 'comp1_desc', 'comp2_name', 'comp2_desc', 'comp3_name', 'comp3_desc',
  'diff_title', 'diff1', 'diff2', 'diff3', 'diff4',
  'challenge_question', 'challenge1', 'challenge2', 'challenge3',
  'insight_text',
  'strategy_intro', 'phase1_name', 'phase1_desc', 'phase2_name', 'phase2_desc', 'phase3_name', 'phase3_desc',
  'inf1_emv', 'inf2_emv',
  'direction_title', 'direction_tagline',
  'idea_title', 'idea_hook', 'idea_headline', 'idea_body',
  'budget_title',
  'budget1_label', 'budget1_amount', 'budget2_label', 'budget2_amount',
  'budget3_label', 'budget3_amount', 'budget4_label', 'budget4_amount',
  'budget5_label', 'budget5_amount', 'budget6_label', 'budget6_amount',
] as const

function buildDigest(data: Rec): string {
  const brief = getStep<BriefStepData>(data, 'brief')
  const research = getStep<ResearchStepData>(data, 'research')
  const goals = getStep<GoalsStepData>(data, 'goals')
  const audience = getStep<TargetAudienceStepData>(data, 'target_audience')
  const insight = getStep<KeyInsightStepData>(data, 'key_insight')
  const strategy = getStep<StrategyStepData>(data, 'strategy')
  const creative = getStep<CreativeStepData>(data, 'creative')
  const media = getStep<MediaTargetsStepData>(data, 'media_targets')
  const influencers = getStep<InfluencersStepData>(data, 'influencers')

  const digest = {
    brandName: brief.brandName || (data.brandName as string) || (data.brand as string) || '',
    brief: {
      brandBrief: brief.brandBrief,
      painPoints: brief.brandPainPoints,
      objective: brief.brandObjective,
      successMetrics: brief.successMetrics,
    },
    research: research.brandResearch
      ? {
          companyDescription: research.brandResearch.companyDescription,
          competitors: research.brandResearch.competitors,
          brandValues: research.brandResearch.brandValues,
          brandPersonality: research.brandResearch.brandPersonality,
          audience: research.brandResearch.targetDemographics?.primaryAudience,
        }
      : null,
    goals: { goals: goals.goals, customGoals: goals.customGoals, targets: goals.targets },
    audience: {
      gender: audience.targetGender,
      ageRange: audience.targetAgeRange,
      description: audience.targetDescription,
      behavior: audience.targetBehavior,
      insights: audience.targetInsights,
      secondary: audience.targetSecondary,
    },
    keyInsight: { insight: insight.keyInsight, source: insight.insightSource, data: insight.insightData },
    strategy: {
      headline: strategy.strategyHeadline,
      description: strategy.strategyDescription,
      pillars: strategy.strategyPillars,
      flow: strategy.strategyFlow?.steps,
    },
    creative: {
      title: creative.activityTitle,
      concept: creative.activityConcept,
      description: creative.activityDescription,
      approach: creative.activityApproach,
      differentiator: creative.activityDifferentiator,
      keyMessages: creative.keyMessages,
      visualDirection: creative.visualDirection,
    },
    budget: { total: media.budget, currency: media.currency, cpe: media.cpe, reach: media.potentialReach },
    influencers: (influencers.influencers ?? []).slice(0, 2).map((i) => ({
      name: i.name,
      followers: i.followers,
      avgReelViews: i.avgReelViews,
      engagementRate: i.engagementRate,
    })),
  }
  return JSON.stringify(digest, null, 1)
}

const SYSTEM_PROMPT = `אתה אסטרטג קריאייטיב בסוכנות המשפיענים Leaders. אתה ממלא שדות של מצגת קריאייטיב ואסטרטגיה ללקוח, על בסיס נתוני הצעה קיימים בלבד.

חוקים מחייבים:
- עברית מקצועית ושיווקית. כותרות פאזות (phase names) ושדות direction/idea title יכולים להיות באנגלית אם זה חד יותר.
- לעולם אל תמציא מספרים. מספר מופיע רק אם הוא קיים בנתונים או נגזר חשבונית מהם.
- שורות התקציב (budget1-6) הן הצעת פיצול של התקציב הכולל הנתון: הסכומים חייבים להסתכם בדיוק לסך הכולל. אם אין תקציב כולל בנתונים — החזר "" בכל שדות התקציב.
- inf1_emv / inf2_emv: אם אין נתון EMV אמיתי — החזר "—".
- שדה שאין לו שום ביסוס בנתונים — החזר "" (ריק), אל תמלא ג'נרי.
- בלי סופרלטיבים ריקים ("פורץ דרך", "חדשני") ובלי "בעידן הדיגיטלי".
- פורמט סכומים: "350,000 ₪".`

function buildPrompt(digest: string): string {
  return `נתוני ההצעה (JSON):
${digest}

מלא את כל השדות הבאים של המצגת. החזר JSON יחיד עם כל המפתחות:

- campaign_title: כותרת שער — שם המותג + מהות הקמפיין (עד 8 מילים)
- about_brand: פסקת "על המותג" (2-3 משפטים)
- goal1..goal3: שלוש מטרות הקמפיין (משפט ממוקד כל אחת)
- audience_intro: משפט פתיח לעמוד הקהלים
- audience1..audience6: שישה סגמנטי קהל (2-4 מילים כל אחד; אם יש פחות בנתונים — גזור סגמנטים הגיוניים מתיאור הקהל, בלי להמציא דמוגרפיה שלא נתמכת)
- value1..value3: שלושה ערכי מותג (כותרת קצרה + הסבר קצרצר באותה שורה)
- comp1_name/comp1_desc..comp3: שלושה מתחרים ותיאור קצר (רק מתחרים שמופיעים בנתונים; אם אין — "")
- diff_title: כותרת קצרה לבידול (למשל "הבידול שלנו")
- diff1..diff4: ארבע נקודות בידול (2-4 מילים כל אחת)
- challenge_question: האתגר כשאלה אחת חדה
- challenge1..challenge3: שלושה מרכיבי האתגר
- insight_text: התובנה המרכזית (משפט-שניים חזקים)
- strategy_intro: פסקת האסטרטגיה (2-3 משפטים)
- phase1_name/phase1_desc..phase3: שלושה שלבי המהלך — שם קצר (מילה-שתיים, אפשר באנגלית) + תיאור בשורה אחת
- inf1_emv, inf2_emv: ראה חוקים
- direction_title: "כיוון 1 | <שם הכיוון>"
- direction_tagline: משפט תמצית + 4-5 מילות מפתח מופרדות ב-" / "
- idea_title: "Idea 01 | <שם הרעיון>"
- idea_hook: משפט פתיחה מסקרן שמסתיים ב->>
- idea_headline: כותרת הרעיון (עד 8 מילים)
- idea_body: פירוט הרעיון (3-4 משפטים)
- budget_title: "<שם הקמפיין> | תקציב"
- budget1_label/budget1_amount..budget6: שש שורות תקציב (ראה חוקים — חייב להסתכם לסך הכולל)`
}

async function generateNarrativeFields(data: Rec, tag: string): Promise<Record<string, string>> {
  const digest = buildDigest(data)
  const schemaProps: Record<string, unknown> = {}
  for (const f of AI_TEXT_FIELDS) schemaProps[f] = { type: 'string' }

  const models = await resolveModels(
    'canva_autofill.primary_model',
    'canva_autofill.fallback_model',
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
  )

  let lastErr: unknown
  for (const model of models) {
    try {
      console.log(`[${tag}] narrative fields via ${model}…`)
      const result = await callAI({
        model,
        prompt: buildPrompt(digest),
        systemPrompt: SYSTEM_PROMPT,
        responseSchema: { type: 'object', properties: schemaProps, required: [...AI_TEXT_FIELDS] },
        maxOutputTokens: 8192,
        callerId: 'canva-autofill-deck',
        noGlobalFallback: true,
      })
      const parsed = parseGeminiJson<Record<string, string>>(result.text)
      const out: Record<string, string> = {}
      for (const f of AI_TEXT_FIELDS) {
        const v = parsed[f]
        if (typeof v === 'string' && v.trim()) out[f] = v.trim()
      }
      return out
    } catch (e) {
      lastErr = e
      console.warn(`[${tag}] ${model} failed:`, e instanceof Error ? e.message : e)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('narrative field generation failed')
}

// ─── Main entry ────────────────────────────────────────

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Fill the creative-strategy brand template from a document's pipeline data
 * and persist the resulting native design on documents.data._canva.native.
 */
export async function autofillCreativeDeckFromDocument(
  documentId: string,
  tag = 'canva-native',
): Promise<NativeDeckResult> {
  const sb = service()
  const { data: doc, error } = await sb.from('documents').select('data').eq('id', documentId).single()
  if (error || !doc) throw new Error(`document ${documentId} not found`)
  const data = (doc.data ?? {}) as Rec

  const deterministic = mapDeterministicFields(data)
  const narrative = await generateNarrativeFields(data, tag)
  // Deterministic values win — the model never overrides real numbers/URLs.
  const merged: Record<string, string | AutofillFieldValue> = { ...narrative, ...deterministic }

  const dataset = await getBrandTemplateDataset(CREATIVE_DECK_TEMPLATE_ID)
  if (!Object.keys(dataset).length) {
    throw new Error(`template ${CREATIVE_DECK_TEMPLATE_ID} has no autofill dataset`)
  }
  const { data: payload, dropped } = await buildAutofillData(dataset, merged)
  if (!Object.keys(payload).length) throw new Error('no fields to fill')

  const brandName =
    getStep<BriefStepData>(data, 'brief').brandName ||
    (data.brandName as string) ||
    (data.brand as string) ||
    'לקוח'
  console.log(`[${tag}] autofilling ${Object.keys(payload).length} fields (${dropped.length} dropped)…`)
  const result = await autofillFromBrandTemplate({
    brandTemplateId: CREATIVE_DECK_TEMPLATE_ID,
    title: `מצגת קריאייטיב — ${brandName}`,
    data: payload,
  })

  const native: NativeDeckResult = {
    designId: result.designId,
    editUrl: result.editUrl,
    viewUrl: result.viewUrl,
    templateId: CREATIVE_DECK_TEMPLATE_ID,
    filledFields: Object.keys(payload).length,
    droppedFields: dropped,
  }

  try {
    const { data: fresh } = await sb.from('documents').select('data').eq('id', documentId).single()
    const freshData = (fresh?.data ?? {}) as Rec
    const canva = isRec(freshData._canva) ? freshData._canva : {}
    await sb
      .from('documents')
      .update({
        data: { ...freshData, _canva: { ...canva, native: { ...native, filledAt: new Date().toISOString() } } },
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
  } catch (e) {
    console.warn(`[${tag}] _canva.native persist failed (non-fatal):`, e instanceof Error ? e.message : e)
  }

  console.log(`[${tag}] ✅ native design ${native.designId}`)
  return native
}
