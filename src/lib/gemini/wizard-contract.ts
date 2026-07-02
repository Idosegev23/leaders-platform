/**
 * Wizard-fidelity contract (spec C4) — the user's wizard inputs are BINDING facts.
 *
 * buildWizardContract() distills wizard step data into itemized requirements +
 * a Hebrew MANDATORY prompt block injected into the presentation agent.
 * checkWizardCoverage() fuzzy-checks each item actually appears on an allowed
 * slide type. Misses feed a targeted repair pass / meta.validation flags —
 * verification never blocks generation.
 *
 * Pure module: no network, no Gemini calls (safe to unit-test offline).
 */

import type {
  BriefStepData,
  GoalsStepData,
  TargetAudienceStepData,
  KeyInsightStepData,
  StrategyStepData,
  CreativeStepData,
  DeliverablesStepData,
  QuantitiesStepData,
  MediaTargetsStepData,
  InfluencersStepData,
} from '@/types/wizard'

// ─── Public API ─────────────────────────────────────────

export interface ContractItem {
  id: string
  sourceStep: string
  sourceField: string
  /** Hebrew, human/model-readable description of the obligation. */
  requirement: string
  /** Slide types where the value must appear. Empty = style directive (prompt-only, not checked). */
  mustAppearIn: string[]
  /** true → exact quote (≥70% token presence); false → fact (≥40% overlap or numeric anchor). */
  verbatim: boolean
  value: string | string[]
}

export interface WizardContract {
  items: ContractItem[]
  /** Hebrew MANDATORY block to append to the generation prompt. Empty when no items. */
  promptBlock: string
}

export interface CoverageResult {
  covered: ContractItem[]
  missing: ContractItem[]
  report: string
}

// ─── Thresholds ─────────────────────────────────────────

const VERBATIM_TOKEN_RATIO = 0.7
const FUZZY_TOKEN_RATIO = 0.4
/** For array values: fraction of elements that must be found for the item to count as covered. */
const ARRAY_COVERAGE_RATIO = 0.75

// ─── Small guards ───────────────────────────────────────

type Rec = Record<string, unknown>

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => str(x)).filter(Boolean)
}

function objArr(v: unknown): Rec[] {
  return Array.isArray(v) ? v.filter(isRec) : []
}

/**
 * Resolve a wizard step's data. Supports both shapes seen in the codebase:
 *  - step-keyed: { brief: {...}, goals: {...} }
 *  - document data: { ..., _wizardState: { stepData: { brief: {...} } } }
 * Flat proposal-data fallbacks (wizardDataToProposalData output) are handled per-field by callers.
 */
function getStep<T>(wd: Rec, stepId: string): Partial<T> {
  if (isRec(wd[stepId])) return wd[stepId] as Partial<T>
  // Research/agent flow persists step data under _stepData (see
  // /research/[id] + generate-background); wizard flow under _wizardState.
  if (isRec(wd._stepData) && isRec((wd._stepData as Rec)[stepId])) {
    return (wd._stepData as Rec)[stepId] as Partial<T>
  }
  const ws = wd._wizardState
  if (isRec(ws) && isRec(ws.stepData) && isRec((ws.stepData as Rec)[stepId])) {
    return (ws.stepData as Rec)[stepId] as Partial<T>
  }
  return {}
}

function currencySymbol(currency: string): string {
  const c = currency.toUpperCase()
  if (c.includes('USD') || c.includes('$')) return '$'
  if (c.includes('EUR') || c.includes('€')) return '€'
  return '₪'
}

function fmtInt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(n)
}

// ─── buildWizardContract ────────────────────────────────

export function buildWizardContract(wizardData: Record<string, unknown>): WizardContract {
  const wd: Rec = isRec(wizardData) ? wizardData : {}
  const items: ContractItem[] = []

  const push = (item: ContractItem) => {
    const vals = Array.isArray(item.value) ? item.value : [item.value]
    if (vals.some(v => v.trim().length > 0)) items.push(item)
  }

  // brief — brand name is a hard fact on cover/closing
  const brief = getStep<BriefStepData>(wd, 'brief')
  const brandName = str(brief.brandName) || str(wd.brandName)
  if (brandName) {
    push({
      id: 'brief.brandName', sourceStep: 'brief', sourceField: 'brandName',
      requirement: 'שם המותג', mustAppearIn: ['cover', 'closing'], verbatim: true, value: brandName,
    })
  }

  // goals → goals slide
  const goals = getStep<GoalsStepData>(wd, 'goals')
  const goalVals = objArr(goals.goals ?? wd.goalsDetailed)
    .map(g => [str(g.title), str(g.description)].filter(Boolean).join(' — '))
    .filter(Boolean)
  if (goalVals.length) {
    push({
      id: 'goals.goals', sourceStep: 'goals', sourceField: 'goals',
      requirement: 'מטרות הקמפיין שהוגדרו בוויזארד', mustAppearIn: ['goals'], verbatim: false, value: goalVals,
    })
  }
  const customGoals = strArr(goals.customGoals)
  if (customGoals.length) {
    push({
      id: 'goals.customGoals', sourceStep: 'goals', sourceField: 'customGoals',
      requirement: 'מטרות נוספות שהוסיף המשתמש', mustAppearIn: ['goals'], verbatim: false, value: customGoals,
    })
  }
  const targetVals = objArr(goals.targets ?? wd.measurableTargets)
    .map(t => {
      const base = [str(t.metric), str(t.value)].filter(Boolean).join(': ')
      const timeline = str(t.timeline)
      return base ? (timeline ? `${base} (${timeline})` : base) : ''
    })
    .filter(Boolean)
  if (targetVals.length) {
    push({
      id: 'goals.targets', sourceStep: 'goals', sourceField: 'targets',
      requirement: 'יעדים מדידים — המספרים חייבים להופיע במדויק', mustAppearIn: ['goals'], verbatim: false, value: targetVals,
    })
  }

  // target_audience → audience slide
  const ta = getStep<TargetAudienceStepData>(wd, 'target_audience')
  const targetDescription = str(ta.targetDescription) || str(wd.targetDescription)
  if (targetDescription) {
    push({
      id: 'target_audience.targetDescription', sourceStep: 'target_audience', sourceField: 'targetDescription',
      requirement: 'תיאור קהל היעד', mustAppearIn: ['audience'], verbatim: false, value: targetDescription,
    })
  }
  const targetInsights = strArr(ta.targetInsights).length ? strArr(ta.targetInsights) : strArr(wd.targetInsights)
  if (targetInsights.length) {
    push({
      id: 'target_audience.targetInsights', sourceStep: 'target_audience', sourceField: 'targetInsights',
      requirement: 'תובנות על קהל היעד', mustAppearIn: ['audience'], verbatim: false, value: targetInsights,
    })
  }

  // key_insight → insight slide (insight itself is a verbatim quote)
  const ki = getStep<KeyInsightStepData>(wd, 'key_insight')
  const keyInsight = str(ki.keyInsight) || str(wd.keyInsight)
  if (keyInsight) {
    push({
      id: 'key_insight.keyInsight', sourceStep: 'key_insight', sourceField: 'keyInsight',
      requirement: 'התובנה המרכזית — ציטוט מדויק', mustAppearIn: ['insight'], verbatim: true, value: keyInsight,
    })
  }
  const insightSource = str(ki.insightSource) || str(wd.insightSource)
  if (insightSource) {
    push({
      id: 'key_insight.insightSource', sourceStep: 'key_insight', sourceField: 'insightSource',
      requirement: 'מקור התובנה', mustAppearIn: ['insight'], verbatim: false, value: insightSource,
    })
  }
  const insightData = str(ki.insightData) || str(wd.insightData)
  if (insightData) {
    push({
      id: 'key_insight.insightData', sourceStep: 'key_insight', sourceField: 'insightData',
      requirement: 'הנתון התומך בתובנה', mustAppearIn: ['insight'], verbatim: false, value: insightData,
    })
  }

  // strategy → strategy slide (pillar TITLES are verbatim)
  const strategy = getStep<StrategyStepData>(wd, 'strategy')
  const strategyHeadline = str(strategy.strategyHeadline) || str(wd.strategyHeadline)
  if (strategyHeadline) {
    push({
      id: 'strategy.strategyHeadline', sourceStep: 'strategy', sourceField: 'strategyHeadline',
      requirement: 'כותרת האסטרטגיה', mustAppearIn: ['strategy'], verbatim: false, value: strategyHeadline,
    })
  }
  const pillarTitles = objArr(strategy.strategyPillars ?? wd.strategyPillars).map(p => str(p.title)).filter(Boolean)
  if (pillarTitles.length) {
    push({
      id: 'strategy.strategyPillars', sourceStep: 'strategy', sourceField: 'strategyPillars',
      requirement: 'עמודי האסטרטגיה — כותרות מדויקות', mustAppearIn: ['strategy'], verbatim: true, value: pillarTitles,
    })
  }

  // creative → bigIdea slide; tone/visual are STYLE directives (prompt-only)
  const creative = getStep<CreativeStepData>(wd, 'creative')
  const activityTitle = str(creative.activityTitle) || str(wd.activityTitle)
  if (activityTitle) {
    push({
      id: 'creative.activityTitle', sourceStep: 'creative', sourceField: 'activityTitle',
      requirement: 'שם הפעילות/הקמפיין — ציטוט מדויק', mustAppearIn: ['bigIdea'], verbatim: true, value: activityTitle,
    })
  }
  const activityConcept = str(creative.activityConcept) || str(wd.activityConcept)
  if (activityConcept) {
    push({
      id: 'creative.activityConcept', sourceStep: 'creative', sourceField: 'activityConcept',
      requirement: 'הקונספט הקריאייטיבי', mustAppearIn: ['bigIdea'], verbatim: false, value: activityConcept,
    })
  }
  const keyMessages = strArr(creative.keyMessages).length ? strArr(creative.keyMessages) : strArr(wd.keyMessages)
  if (keyMessages.length) {
    push({
      id: 'creative.keyMessages', sourceStep: 'creative', sourceField: 'keyMessages',
      requirement: 'מסרים מרכזיים', mustAppearIn: ['bigIdea', 'strategy'], verbatim: false, value: keyMessages,
    })
  }
  const toneOfManner = str(creative.toneOfManner) || str(wd.toneOfManner)
  if (toneOfManner) {
    push({
      id: 'creative.toneOfManner', sourceStep: 'creative', sourceField: 'toneOfManner',
      requirement: 'טון ואופן דיבור (הנחיית סגנון)', mustAppearIn: [], verbatim: false, value: toneOfManner,
    })
  }
  const visualDirection = str(creative.visualDirection) || str(wd.visualDirection)
  if (visualDirection) {
    push({
      id: 'creative.visualDirection', sourceStep: 'creative', sourceField: 'visualDirection',
      requirement: 'כיוון ויזואלי (הנחיית סגנון)', mustAppearIn: [], verbatim: false, value: visualDirection,
    })
  }

  // deliverables → deliverables slide (quantities exact)
  const deliverables = getStep<DeliverablesStepData>(wd, 'deliverables')
  const deliverableVals = objArr(deliverables.deliverables ?? wd.deliverablesDetailed)
    .map(d => {
      const type = str(d.type)
      if (!type) return ''
      const quantity = num(d.quantity)
      return quantity ? `${quantity} ${type}` : type
    })
    .filter(Boolean)
  if (deliverableVals.length) {
    push({
      id: 'deliverables.deliverables', sourceStep: 'deliverables', sourceField: 'deliverables',
      requirement: 'תוצרים וכמויות — הכמויות חייבות להופיע במדויק', mustAppearIn: ['deliverables'], verbatim: false, value: deliverableVals,
    })
  }

  // quantities → deliverables / influencers / numbers slides
  const quantities = getStep<QuantitiesStepData>(wd, 'quantities')
  const qFlat: Rec = isRec(wd.quantitiesSummary) ? wd.quantitiesSummary : {}
  const influencerCount = num(quantities.influencerCount) ?? num(qFlat.influencerCount)
  if (influencerCount) {
    push({
      id: 'quantities.influencerCount', sourceStep: 'quantities', sourceField: 'influencerCount',
      requirement: 'מספר המשפיענים בקמפיין', mustAppearIn: ['influencers', 'deliverables', 'metrics', 'stats'],
      verbatim: false, value: `${influencerCount} משפיענים`,
    })
  }
  const contentTypeVals = objArr(quantities.contentTypes ?? qFlat.contentTypes)
    .map(c => {
      const type = str(c.type)
      if (!type) return ''
      const total = num(c.totalQuantity) ?? num(c.quantityPerInfluencer)
      return total ? `${total} ${type}` : type
    })
    .filter(Boolean)
  if (contentTypeVals.length) {
    push({
      id: 'quantities.contentTypes', sourceStep: 'quantities', sourceField: 'contentTypes',
      requirement: 'סוגי תוכן וכמויות כוללות', mustAppearIn: ['deliverables', 'metrics', 'stats'], verbatim: false, value: contentTypeVals,
    })
  }

  // media_targets → numbers slide (metrics/stats) — one item per metric so misses are targeted
  const mt = getStep<MediaTargetsStepData>(wd, 'media_targets')
  const sym = currencySymbol(str(mt.currency) || str(wd.currency))
  const numbersSlides = ['metrics', 'stats']
  const budget = num(mt.budget) ?? num(wd.budget)
  if (budget) {
    push({
      id: 'media_targets.budget', sourceStep: 'media_targets', sourceField: 'budget',
      requirement: 'תקציב הקמפיין — המספר חייב להופיע במדויק', mustAppearIn: numbersSlides, verbatim: false,
      value: `${sym}${fmtInt(budget)}`,
    })
  }
  const potentialReach = num(mt.potentialReach) ?? num(wd.potentialReach)
  if (potentialReach) {
    push({
      id: 'media_targets.potentialReach', sourceStep: 'media_targets', sourceField: 'potentialReach',
      requirement: 'חשיפה פוטנציאלית', mustAppearIn: numbersSlides, verbatim: false, value: fmtInt(potentialReach),
    })
  }
  const cpe = num(mt.cpe) ?? num(wd.cpe)
  if (cpe) {
    push({
      id: 'media_targets.cpe', sourceStep: 'media_targets', sourceField: 'cpe',
      requirement: 'יעד CPE', mustAppearIn: numbersSlides, verbatim: false, value: `${sym}${cpe}`,
    })
  }
  const cpm = num(mt.cpm) ?? num(wd.cpm)
  if (cpm) {
    push({
      id: 'media_targets.cpm', sourceStep: 'media_targets', sourceField: 'cpm',
      requirement: 'יעד CPM', mustAppearIn: numbersSlides, verbatim: false, value: `${sym}${cpm}`,
    })
  }
  const estimatedImpressions = num(mt.estimatedImpressions) ?? num(wd.estimatedImpressions)
  if (estimatedImpressions) {
    push({
      id: 'media_targets.estimatedImpressions', sourceStep: 'media_targets', sourceField: 'estimatedImpressions',
      requirement: 'אימפרשנים משוערים', mustAppearIn: numbersSlides, verbatim: false, value: fmtInt(estimatedImpressions),
    })
  }

  // influencers → influencer slide (names verbatim)
  const inf = getStep<InfluencersStepData>(wd, 'influencers')
  const influencerNames = objArr(inf.influencers ?? wd.enhancedInfluencers)
    .map(i => str(i.name) || str(i.username))
    .filter(Boolean)
  if (influencerNames.length) {
    push({
      id: 'influencers.influencers', sourceStep: 'influencers', sourceField: 'influencers',
      requirement: 'שמות המשפיענים שנבחרו', mustAppearIn: ['influencers'], verbatim: true, value: influencerNames,
    })
  }

  return { items, promptBlock: buildPromptBlock(items) }
}

// ─── Prompt block ───────────────────────────────────────

function buildPromptBlock(items: ContractItem[]): string {
  if (!items.length) return ''

  const contentItems = items.filter(i => i.mustAppearIn.length > 0)
  const styleItems = items.filter(i => i.mustAppearIn.length === 0)

  const lines: string[] = [
    '## נאמנות לוויזארד (חובה)',
    '',
    'נאמנות לוויזארד — הפרטים הבאים הם עובדות מחייבות שסיפק המשתמש. שבץ אותם כלשונם: ' +
      'מותר לשפר ניסוח · אסור להחליף עובדה, מבנה או מספר. ' +
      'אסור להשמיט אף פריט ואסור להמציא תחליף. מספרים, תקציבים וכמויות חייבים להופיע בדיוק כפי שהוזנו. ' +
      'אם פריט סותר את המחקר — הפריט של המשתמש גובר.',
    '',
  ]

  contentItems.forEach((item, i) => {
    const marker = item.verbatim ? ' [ציטוט — אסור לשנות ניסוח]' : ''
    const where = ` [שקף: ${item.mustAppearIn.join('/')}]`
    if (Array.isArray(item.value)) {
      lines.push(`${i + 1}. ${item.requirement}${where}${marker}:`)
      for (const v of item.value) lines.push(`   • ${v}`)
    } else {
      lines.push(`${i + 1}. ${item.requirement}${where}${marker}: ${item.value}`)
    }
  })

  if (styleItems.length) {
    lines.push('', '### הנחיות סגנון (מעצבות את הטון והוויזואל — לא טקסט להעתקה לשקפים):')
    for (const item of styleItems) {
      const v = Array.isArray(item.value) ? item.value.join(' | ') : item.value
      lines.push(`- ${item.requirement}: ${v}`)
    }
  }

  lines.push(
    '',
    'בסיום — ודא כיסוי מלא: כל פריט מופיע בשקף המתאים. פריט חסר → הוסף לפני מסירה.',
  )

  return lines.join('\n')
}

// ─── Coverage checker ───────────────────────────────────

/** slideType aliases → canonical (structured pipeline uses 'stats', agent uses 'metrics', etc.). */
const SLIDE_TYPE_ALIASES: Record<string, string> = {
  stats: 'metrics',
  kpi: 'metrics',
  numbers: 'metrics',
  creative: 'bigidea',
  concept: 'bigidea',
  talent: 'influencers',
  influencer: 'influencers',
  persona: 'audience',
  targetaudience: 'audience',
  keyinsight: 'insight',
  objectives: 'goals',
  hero: 'cover',
  cta: 'closing',
}

function canonicalType(t: string): string {
  const k = t.toLowerCase().replace(/[^a-z0-9\u0590-\u05FF]/g, '')
  return SLIDE_TYPE_ALIASES[k] || k
}

const HEBREW_PREFIXES = ['ו', 'ה', 'ב', 'ל', 'מ', 'ש']

const STOPWORDS = new Set([
  'של', 'את', 'עם', 'על', 'גם', 'זה', 'זו', 'זאת', 'כל', 'לא', 'או', 'כי', 'אם',
  'הוא', 'היא', 'הם', 'הן', 'אבל', 'רק', 'עוד', 'כך', 'בין', 'אל', 'מול', 'כמו',
  'יותר', 'אצל', 'לגבי', 'כדי', 'the', 'and', 'for', 'with', 'our', 'your',
])

function normalizeText(s: string): string {
  return s.normalize('NFKC').replace(/["'`״׳]/g, '').replace(/\s+/g, ' ').trim()
}

/** Letter tokens only (numbers handled separately), len>=2, minus stopwords. */
function wordTokens(s: string): string[] {
  return normalizeText(s)
    .toLowerCase()
    .split(/[^a-z\u0590-\u05FF]+/)
    .filter(t => t.length >= 2 && !STOPWORDS.has(t))
}

/** Token + up-to-2 stripped Hebrew prefixes (ו/ה/ב/ל/מ/ש), remainder len>=2. */
function tokenVariants(t: string): string[] {
  const out = [t]
  let cur = t
  for (let i = 0; i < 2; i++) {
    if (cur.length >= 3 && HEBREW_PREFIXES.includes(cur[0])) {
      cur = cur.slice(1)
      out.push(cur)
    } else break
  }
  return out
}

function tokensMatch(a: string, b: string): boolean {
  for (const x of tokenVariants(a)) {
    for (const y of tokenVariants(b)) {
      if (x === y) return true
      // light suffix tolerance (Hebrew plurals: רילס ↔ רילסים)
      if (x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x))) return true
    }
  }
  return false
}

/** Extract numeric values, normalizing ₪/%/, and K/M suffixes (90K → 90000, 1.5M → 1500000). */
function extractNumbers(text: string): number[] {
  const out: number[] = []
  const re = /(\d[\d.,]*)([KkMm])(?![A-Za-z\u0590-\u05FF\d])|(\d[\d.,]*)/g
  for (const m of Array.from(text.matchAll(re))) {
    const raw = m[1] ?? m[3]
    const suffix = m[1] ? m[2] : undefined
    let s = raw.replace(/[.,]+$/, '')
    s = s.replace(/,(?=\d{3}(\D|$))/g, '') // thousands grouping
    s = s.replace(/,/g, '.') // leftover comma = decimal separator
    const n = Number.parseFloat(s)
    if (!Number.isFinite(n)) continue
    out.push(suffix ? n * (suffix.toLowerCase() === 'k' ? 1e3 : 1e6) : n)
  }
  return out
}

function numEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

interface SlideIndex {
  canon: string
  words: string[]
  numbers: number[]
}

/** Serialize slot leaf values (skipping URLs — asset paths carry junk digits/tokens). */
function collectText(v: unknown, out: string[]): void {
  if (typeof v === 'string') {
    if (!/^https?:\/\//i.test(v.trim())) out.push(v)
  } else if (typeof v === 'number') {
    out.push(String(v))
  } else if (Array.isArray(v)) {
    for (const x of v) collectText(x, out)
  } else if (isRec(v)) {
    for (const x of Object.values(v)) collectText(x, out)
  }
}

function indexSlide(slide: { slideType?: string; slots?: unknown }): SlideIndex {
  const texts: string[] = []
  collectText(slide.slots, texts)
  const joined = texts.join(' ')
  return {
    canon: canonicalType(slide.slideType || ''),
    words: Array.from(new Set(wordTokens(joined))),
    numbers: extractNumbers(normalizeText(joined)),
  }
}

/**
 * One value against one slide:
 *  - numbers in the value must ALL appear exactly on the slide (₪/K/M/% normalized) — a
 *    contradicted number is always a miss ("אסור להחליף מספרים").
 *  - verbatim: ≥70% of significant tokens present; non-verbatim: ≥40% or a numeric anchor.
 */
function valueCoveredOnSlide(value: string, slide: SlideIndex, verbatim: boolean): boolean {
  const words = Array.from(new Set(wordTokens(value)))
  const numbers = extractNumbers(normalizeText(value))
  const numbersOk = numbers.every(n => slide.numbers.some(sn => numEq(n, sn)))
  if (numbers.length > 0 && !numbersOk) return false
  if (words.length === 0) return numbers.length > 0
  const matched = words.filter(w => slide.words.some(sw => tokensMatch(w, sw))).length
  const ratio = matched / words.length
  if (ratio >= (verbatim ? VERBATIM_TOKEN_RATIO : FUZZY_TOKEN_RATIO)) return true
  if (!verbatim && numbers.length > 0) return true // numeric anchor suffices for facts
  return false
}

export function checkWizardCoverage(
  slides: Array<{ slideType?: string; slots?: unknown }>,
  contract: WizardContract,
): CoverageResult {
  const covered: ContractItem[] = []
  const missing: ContractItem[] = []
  const lines: string[] = []

  if (!contract.items.length) {
    return { covered, missing, report: 'כיסוי ויזארד: אין פריטי חוזה לבדיקה' }
  }

  const idx = (slides || []).map(indexSlide)

  for (const item of contract.items) {
    // Style directives impose no slide-text requirement
    if (item.mustAppearIn.length === 0) {
      covered.push(item)
      lines.push(`✓ ${item.id} — ${item.requirement} (סגנון, לא נבדק בשקפים)`)
      continue
    }

    const allowed = new Set(item.mustAppearIn.map(canonicalType))
    const candidates = idx.filter(s => allowed.has(s.canon))
    const vals = Array.isArray(item.value) ? item.value : [item.value]

    if (candidates.length === 0) {
      missing.push(item)
      lines.push(`✗ ${item.id} — ${item.requirement} | אין שקף מסוג ${item.mustAppearIn.join('/')}`)
      continue
    }

    const missingVals = vals.filter(v => !candidates.some(s => valueCoveredOnSlide(v, s, item.verbatim)))
    const pass = Array.isArray(item.value)
      ? (vals.length - missingVals.length) / vals.length >= ARRAY_COVERAGE_RATIO
      : missingVals.length === 0

    if (pass) {
      covered.push(item)
      lines.push(`✓ ${item.id} — ${item.requirement}`)
    } else {
      missing.push(item)
      lines.push(`✗ ${item.id} — ${item.requirement} | חסר בשקפי ${item.mustAppearIn.join('/')}: ${missingVals.map(v => `"${v}"`).join(', ')}`)
    }
  }

  const styleCount = contract.items.filter(i => i.mustAppearIn.length === 0).length
  const contentTotal = contract.items.length - styleCount
  const contentCovered = covered.length - styleCount
  const header = `כיסוי ויזארד: ${contentCovered}/${contentTotal} פריטי תוכן מכוסים` +
    (missing.length ? ` • ${missing.length} חסרים` : '') +
    (styleCount ? ` • ${styleCount} הנחיות סגנון` : '')

  return { covered, missing, report: [header, ...lines].join('\n') }
}
