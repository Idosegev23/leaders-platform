/**
 * Deck Blueprint ("הפיצוח") — the strategic plan the user reviews and corrects
 * BEFORE slides are rendered.
 *
 * Today the presentation agent researches, plans, and renders 14–22 slides in
 * one opaque pass. This module surfaces the PLANNING layer as an editable
 * artifact: the strategic crack, the insight (spine), the strategy, and a
 * slide-by-slide plan (what each slide shows / focuses on). The user edits it
 * on /blueprint/[id]; on approval the plan becomes a binding mandate the agent
 * renders from exactly (see blueprintToMandate + presentation-agent).
 *
 * One gemini-3.1-pro JSON call — no per-slide HTML, so it's fast (~1–2 min).
 */

import { callAI } from '@/lib/ai-provider'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'

const PRO_MODEL = process.env.GEMINI_REASONING_MODEL || 'gemini-3.1-pro-preview'

// ─── Types ──────────────────────────────────────────────

export interface BlueprintSlide {
  /** lowercase-kebab beat: cover, insight, pillar-1, creative, metrics, closing… */
  slideType: string
  /** proposed Hebrew title */
  title: string
  /** why this slide exists in the story — its through-line role */
  purpose: string
  /** content plan — what the slide presents */
  whatItShows: string
  /** the one thing it focuses on (its single dramatic choice) */
  focus: string
}

export interface DeckBlueprint {
  /** הפיצוח — the strategic breakthrough, 1–2 sentences */
  theCrack: string
  /** the insight that is the spine of the whole deck */
  keyInsight: string
  strategy: {
    headline: string
    pillars: Array<{ title: string; description: string }>
  }
  /** who + what we emphasize */
  audienceFocus: string
  /** the slide-by-slide plan (typically 14–22) */
  slidePlan: BlueprintSlide[]
  generatedAt: string
  /** set true when the user confirms the blueprint on /blueprint/[id] */
  approved?: boolean
}

export interface BlueprintInput {
  brandName: string
  briefText?: string
  /** _brandResearch object (the "brain") if already computed */
  brandResearch?: Record<string, unknown>
  /** full document.data — wizard steps (_stepData / flat fields) are read from here */
  wizardData?: Record<string, unknown>
}

// ─── Test seam (Gemini host is blocked from the dev sandbox) ─────

type BlueprintCaller = (prompt: string) => Promise<string>
let caller: BlueprintCaller | null = null
/** Inject a canned model response for tests; pass null to restore. */
export function __setBlueprintCallerForTests(fn: BlueprintCaller | null): void {
  caller = fn
}

async function callModel(prompt: string): Promise<string> {
  if (caller) return caller(prompt)
  const result = await callAI({
    model: PRO_MODEL,
    prompt,
    callerId: 'deck-blueprint',
    geminiConfig: {
      thinkingConfig: { thinkingLevel: 'MEDIUM' as never },
      responseMimeType: 'application/json',
      maxOutputTokens: 8000,
    },
  })
  return result.text || ''
}

// ─── Prompt ─────────────────────────────────────────────

function compact(v: unknown, max = 6000): string {
  if (!v) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 1)
  return s.length > max ? s.slice(0, max) + '…' : s
}

function buildPrompt(input: BlueprintInput): string {
  return `<role>
אתה אסטרטג ראשי בסוכנות שיווק משפיענים פרימיום. לפני שבונים מצגת, אתה כותב את
"הפיצוח" — התוכנית האסטרטגית המלאה שהצוות יאשר: מה התובנה, מה האסטרטגיה, ומה
כל שקף במצגת יציג ועל מה יתמקד.
</role>

<mission>
מהבריף והמחקר → פיצוח אסטרטגי + תוכנית שקף-אחר-שקף. זה לא המצגת עצמה — זו
ההחלטה איך המצגת תסופר. המשתמש יערוך את זה, ואז המצגת תיבנה בדיוק לפי מה שאישר.
</mission>

<principles>
- ה-INSIGHT הוא עמוד השדרה. כל שקף אחריו מפתח אותו — נטען, מוכח, נפרע. אין "שקף אי".
- אורך נגזר מהסיפור (לרוב 14–22 שקפים). כל pillar מקבל שקף משלו; קריאייטיב מקבל דוגמאות קונקרטיות.
- אמת בלבד: אל תמציא מספרים, מתחרים או handles. אין נתון? כתוב מה צריך לברר.
- קשת: cover → brief → goals → audience → INSIGHT → strategy → pillars → bigIdea →
  creative → influencers → deliverables → metrics → closing (beat יכול להתפרש על כמה שקפים).
</principles>

<brand>${input.brandName}</brand>

<brief>
${compact(input.briefText, 6000) || '(אין בריף טקסטואלי — הסתמך על נתוני הוויזארד והמחקר)'}
</brief>

<brand_research>
${compact(input.brandResearch, 6000) || '(אין מחקר — גזור מהבריף)'}
</brand_research>

<wizard_data>
${compact(pickWizardHighlights(input.wizardData), 4000) || '(אין נתוני ויזארד)'}
</wizard_data>

<output>
החזר JSON תקין בלבד (ללא markdown, ללא הסבר), במבנה המדויק:
{
  "theCrack": "משפט-שניים: הפיצוח האסטרטגי המרכזי",
  "keyInsight": "התובנה שהיא עמוד השדרה של כל המצגת",
  "strategy": {
    "headline": "כותרת האסטרטגיה",
    "pillars": [ { "title": "עמוד תווך", "description": "מה עושים ולמה זה עובד" } ]
  },
  "audienceFocus": "על מי מדברים ומה מדגישים",
  "slidePlan": [
    {
      "slideType": "cover | insight | pillar-1 | creative | metrics | closing …",
      "title": "כותרת עברית מוצעת לשקף",
      "purpose": "למה השקף הזה קיים בסיפור (התפקיד בחוט השני)",
      "whatItShows": "מה השקף מציג בפועל",
      "focus": "הדבר האחד שהשקף מתמקד בו"
    }
  ]
}
כל השדות בעברית. slidePlan באורך שהסיפור דורש (14–22 בד"כ), בסדר, כשהתובנה מתפתחת לאורכו.
</output>`
}

/** Pull only the load-bearing wizard fields so the prompt stays focused. */
function pickWizardHighlights(wd: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!wd || typeof wd !== 'object') return {}
  const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const step = (id: string): Record<string, unknown> => {
    if (isRec(wd[id])) return wd[id] as Record<string, unknown>
    const sd = wd._stepData
    if (isRec(sd) && isRec(sd[id])) return sd[id] as Record<string, unknown>
    const ws = wd._wizardState
    if (isRec(ws) && isRec(ws.stepData) && isRec((ws.stepData as Record<string, unknown>)[id])) {
      return (ws.stepData as Record<string, unknown>)[id] as Record<string, unknown>
    }
    return {}
  }
  const out: Record<string, unknown> = {}
  const brief = step('brief'); const goals = step('goals'); const ta = step('target_audience')
  const ki = step('key_insight'); const strat = step('strategy'); const creative = step('creative')
  const mt = step('media_targets'); const q = step('quantities'); const inf = step('influencers')
  if (brief.brandBrief || wd.brandBrief) out.brief = brief.brandBrief || wd.brandBrief
  if (goals.goals || wd.goals) out.goals = goals.goals || wd.goals
  if (ta.targetDescription || wd.targetDescription) out.audience = ta.targetDescription || wd.targetDescription
  if (ki.keyInsight || wd.keyInsight) out.keyInsight = ki.keyInsight || wd.keyInsight
  if (strat.strategyHeadline || strat.strategyPillars) out.strategy = { headline: strat.strategyHeadline, pillars: strat.strategyPillars }
  if (creative.activityTitle || creative.activityConcept) out.creative = { title: creative.activityTitle, concept: creative.activityConcept, messages: creative.keyMessages }
  if (mt.budget || wd.budget) out.budget = mt.budget || wd.budget
  if (q.influencerCount || q.contentTypes) out.quantities = { influencers: q.influencerCount, contentTypes: q.contentTypes }
  if (inf.influencers) out.influencers = inf.influencers
  return out
}

// ─── Public API ─────────────────────────────────────────

export async function generateDeckBlueprint(input: BlueprintInput): Promise<DeckBlueprint> {
  if (!input.brandName?.trim()) throw new Error('generateDeckBlueprint: brandName is required')
  const raw = await callModel(buildPrompt(input))
  const parsed = parseGeminiJson<Partial<DeckBlueprint>>(raw)

  const slidePlan: BlueprintSlide[] = Array.isArray(parsed.slidePlan)
    ? parsed.slidePlan
        .filter((s): s is BlueprintSlide => !!s && typeof s === 'object')
        .map((s) => ({
          slideType: String(s.slideType || 'content').trim().toLowerCase().replace(/\s+/g, '-'),
          title: String(s.title || '').trim(),
          purpose: String(s.purpose || '').trim(),
          whatItShows: String(s.whatItShows || '').trim(),
          focus: String(s.focus || '').trim(),
        }))
    : []
  if (slidePlan.length === 0) throw new Error('generateDeckBlueprint: model returned no slidePlan')

  return {
    theCrack: String(parsed.theCrack || '').trim(),
    keyInsight: String(parsed.keyInsight || '').trim(),
    strategy: {
      headline: String(parsed.strategy?.headline || '').trim(),
      pillars: Array.isArray(parsed.strategy?.pillars)
        ? parsed.strategy!.pillars
            .filter((p) => p && typeof p === 'object')
            .map((p) => ({ title: String(p.title || '').trim(), description: String(p.description || '').trim() }))
        : [],
    },
    audienceFocus: String(parsed.audienceFocus || '').trim(),
    slidePlan,
    generatedAt: new Date().toISOString(),
    approved: false,
  }
}

/**
 * Turn an APPROVED blueprint into a binding Hebrew mandate injected into the
 * presentation agent's system prompt. The agent renders slides that follow this
 * plan exactly instead of re-planning.
 */
export function blueprintToMandate(bp: DeckBlueprint): string {
  const pillars = bp.strategy.pillars.map((p, i) => `  ${i + 1}. ${p.title} — ${p.description}`).join('\n')
  const plan = bp.slidePlan
    .map((s, i) => `  שקף ${i + 1} [${s.slideType}] "${s.title}"\n     מציג: ${s.whatItShows}\n     מתמקד: ${s.focus}${s.purpose ? `\n     תפקיד: ${s.purpose}` : ''}`)
    .join('\n')
  return `<approved_blueprint>
זהו הפיצוח האסטרטגי שהמשתמש אישר. בנה את המצגת בדיוק לפיו — אל תתכנן מחדש.
צור שקף אחד לכל שורה בתוכנית, באותו סדר, עם התוכן והמיקוד שנקבעו. מותר לשפר ניסוח,
אסור לשנות את המבנה, הסדר, או המסר של שקף.

הפיצוח: ${bp.theCrack}
התובנה (עמוד השדרה): ${bp.keyInsight}
אסטרטגיה — ${bp.strategy.headline}:
${pillars}
מיקוד קהל: ${bp.audienceFocus}

תוכנית השקפים (${bp.slidePlan.length} שקפים — קרא ל-generate_slide_html לכל אחד, בסדר):
${plan}
</approved_blueprint>`
}
