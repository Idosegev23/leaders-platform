/**
 * Presentation Agent — ONE Gemini agent that builds an entire presentation.
 *
 * Architecture:
 *   1 agent call with multi-tool → researches, plans, generates, inspects.
 *   No data loss between stages — everything stays in context.
 *
 * Tools available to the agent:
 *   - google_search       — brand research (built-in)
 *   - url_context          — scrape brand website (built-in)
 *   - code_execution       — KPI calculations (built-in)
 *   - search_influencers   — IMAI API (function calling)
 *   - generate_slide_html  — creates one HTML slide at a time (function calling)
 *   - generate_image       — Nano Banana Pro for custom images (function calling)
 *
 * Per skill matrix: gemini-3.1-pro + HIGH thinking + multi-tool combining
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { searchIsraeliInfluencers, getAudienceReport } from '@/lib/imai/client'
import { pickPersona, renderAgentSlide } from './slide-personas'
import { checkWizardCoverage, type WizardContract, type CoverageResult } from './wizard-contract'
import { ART_DIRECTOR_RULES, auditDesignSystem } from '@/lib/design/art-director-rules'
import type { BrandAssets } from '@/lib/brand/types'
import type { PremiumDesignSystem } from './slide-design'

// ─── Types ──────────────────────────────────────────────

export interface AgentInput {
  brandName: string
  briefText: string
  kickoffText?: string
  /** Gemini Files API URI for PDF brief (preferred over briefText) */
  briefFileUri?: string
  briefFileMime?: string
  /** Pre-existing data from wizard (optional — agent fills gaps) */
  wizardData?: Record<string, unknown>
  /** Binding wizard requirements (buildWizardContract output) — injected into the prompt and coverage-checked after generation */
  wizardContract?: WizardContract
  /** Brand research already done (optional — agent will research if missing) */
  brandResearch?: Record<string, unknown>
  /** Images already generated */
  images?: Record<string, string>
  /** Verified brand assets (logo / product photos / scenes) — preferred imagery */
  brandAssets?: BrandAssets
  /** Client logo URL */
  clientLogoUrl?: string
  /** Leaders logo URL */
  leadersLogoUrl?: string
  /** Absolute epoch-ms ceiling for OPTIONAL post-passes (wizard repair).
   *  Past it, repair is skipped/aborted so the caller keeps time to persist. */
  deadlineTs?: number
  /** Approved deck blueprint ("הפיצוח") — when present, the agent renders the
   *  slides EXACTLY to this plan instead of planning on its own. */
  blueprintMandate?: string
}

export interface AgentSlide {
  slideType: string
  title: string
  html: string
  /** The content args the agent passed to generate_slide_html (no designColors) — used for wizard-coverage checks */
  content?: Record<string, unknown>
}

export interface AgentOutput {
  designSystem: PremiumDesignSystem
  slides: AgentSlide[]
  htmlSlides: string[]
  slideTypes: string[]
  research?: Record<string, unknown>
  influencers?: Array<{ username: string; followers: number; rationale: string }>
  kpis?: Record<string, number>
  /** Post-repair wizard coverage (present only when a contract was supplied) */
  wizardCoverage?: CoverageResult
  totalToolCalls: number
  durationMs: number
}

export type AgentProgressCallback = (event: {
  stage: string
  message: string
  slideIndex?: number
  totalSlides?: number
}) => void

// ─── Gemini Client ──────────────────────────────────────

let _client: GoogleGenAI | null = null
function getClient(): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { timeout: 600_000 },
    })
  }
  return _client
}

// ─── Function Declarations ──────────────────────────────

const FUNCTION_DECLARATIONS = [
  {
    name: 'search_influencers',
    description:
      'חיפוש משפיענים ישראלים אמיתיים ב-IMAI. keywords באנגלית. ' +
      'החזר רק פרופילים עם קהל ישראלי משמעותי.',
    parameters: {
      type: 'object',
      properties: {
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Topic keywords in English (e.g. ["cooking","food","lifestyle"])',
        },
        platform: { type: 'string', enum: ['instagram', 'tiktok'] },
        minFollowers: { type: 'integer' },
        maxFollowers: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['keywords'],
    },
  },
  {
    name: 'get_influencer_audience',
    description:
      'דמוגרפיה מפורטת ליוצר. יקר בטוקנים — הפעל רק על 2–3 המובילים ' +
      'שכבר סיננת, לא על כולם.',
    parameters: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        platform: { type: 'string', enum: ['instagram', 'tiktok', 'youtube'] },
      },
      required: ['username'],
    },
  },
  {
    name: 'generate_slide_html',
    description:
      'יוצר שקף בודד. פרמטרים: type (enum), title (≤8 מילים), ' +
      'body (≤40 מילים), bullets (≤5), cards (≤4), keyNumber, ' +
      'imageUrl (ייחודי לכל שקף!), designColors. ' +
      'ערכים אמיתיים בלבד — אין @@/TBD/placeholder/שם או handle חלקי. ' +
      'imageUrl של מוצר = המוצר האמיתי של הלקוח (לא לוגו מומצא, לא קטגוריה זרה). ' +
      'תווית/סימן-מים תואמים לסקשן של השקף. ' +
      'שקף תוכן חייב לפחות אחד מרכיבי התוכן.',
    parameters: {
      type: 'object',
      properties: {
        slideType: {
          type: 'string',
          // Free string (not a fixed enum) so the story can span as many slides
          // as it needs — a slide per pillar (pillar-1/pillar-2…), several
          // creative examples, etc. Downstream layout keys off
          // cover/closing/insight/metrics/influencers and treats the rest as
          // content, so any lowercase-kebab label is safe.
          description:
            "Slide beat, lowercase-kebab. First slide 'cover', last 'closing'. " +
            'Suggested beats: cover, brief, goals, audience, insight, strategy, ' +
            'pillar-1, pillar-2, pillar-3, bigIdea, creative, deliverables, ' +
            'influencers, metrics, closing. Emit as many slides as the story needs ' +
            '(typically 14-22) — a slide per pillar and per creative example is encouraged.',
        },
        title: { type: 'string', description: 'Hebrew title, max 8 words' },
        subtitle: { type: 'string', description: 'Hebrew subtitle, max 12 words' },
        bodyText: { type: 'string', description: 'Hebrew body, max 40 words' },
        bulletPoints: { type: 'array', items: { type: 'string' }, description: 'Max 5 bullets, 8 words each' },
        cards: {
          type: 'array',
          items: {
            type: 'object',
            properties: { title: { type: 'string' }, body: { type: 'string' } },
            required: ['title', 'body'],
          },
          description: 'Max 4 cards',
        },
        keyNumber: { type: 'string', description: 'Big stat number (e.g. "₪150,000" or "1.5M")' },
        keyNumberLabel: { type: 'string' },
        imageUrl: { type: 'string', description: 'Image URL to include (object-fit:cover with gradient overlay)' },
        emotionalTone: { type: 'string' },
        designColors: {
          type: 'object',
          properties: {
            primary: { type: 'string' },
            secondary: { type: 'string' },
            accent: { type: 'string' },
            background: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['primary', 'background', 'text'],
        },
      },
      required: ['slideType', 'title', 'designColors'],
    },
  },
  {
    name: 'generate_brand_image',
    description:
      'Nano Banana Pro — סצנת לייפסטייל/מוצר קולנועית. המוצר האמיתי של המותג מוזרק אוטומטית ' +
      'כתמונת רפרנס, אז תאר את הסצנה וההקשר (מטבח חי, שימוש אמיתי, אווירה) והמוצר האמיתי ישולב בה. ' +
      'פרומפט באנגלית, נטול טקסט ונטול לוגו מומצא. פוטוריאליסטי, on-category, בפלטת המותג.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'English scene prompt (detailed, cinematic). Describe the SCENE/context around the product — the real ' +
            'brand product is composited from reference photos automatically. No text, no invented logos, on-category.',
        },
        aspectRatio: { type: 'string', enum: ['16:9', '1:1', '9:16'] },
      },
      required: ['prompt'],
    },
  },
]

// ─── Function Handlers ──────────────────────────────────


interface ImageGenOpts {
  /** Real brand product photos, fed as reference images for on-brand generation. */
  references?: import('./nano-banana-pro').ReferenceImage[]
  /** Brand-fidelity text appended to the prompt (real product, material, palette). */
  brandConstraint?: string
  /** Physical-product descriptor for the visual-truth QA check. */
  productDescriptor?: string
}

async function handleGenerateImage(
  args: Record<string, unknown>,
  opts: ImageGenOpts = {},
): Promise<{ imageUrl: string } | { error: string }> {
  try {
    const { generateWithNanoBanana } = await import('./nano-banana-pro')
    const basePrompt = ((args.prompt as string) || '') + (opts.brandConstraint || '')
    const aspectRatio = (args.aspectRatio as '16:9' | '1:1' | '9:16') || '16:9'
    const refs = opts.references?.length ? opts.references : undefined
    const gen = (extra: string) =>
      generateWithNanoBanana({ prompt: basePrompt + extra, aspectRatio, imageSize: '2K', references: refs })

    let result = await gen('')
    if (!result) return { error: 'Image generation returned null' }

    // ── Visual-truth QA: regenerate ONCE if the image is off-brand / off-category.
    // Infra failures (VLM unreachable) are transient and never trigger a wasteful
    // regen — same flag-don't-block policy as the rest of the art-director engine.
    if (opts.productDescriptor) {
      try {
        const { vlmBinaryCheck } = await import('@/lib/brand/vlm-verify')
        const q =
          `Does this image depict ${opts.productDescriptor} (or a clearly on-category scene for it), ` +
          'photorealistic — WITHOUT copper/brass/gold-colored cookware, WITHOUT abstract art, and ' +
          'WITHOUT invented logos or text overlays? Answer "yes" only if genuinely on-brand and on-category.'
        const check = await vlmBinaryCheck({ imageBase64: result.base64, mimeType: result.mimeType, question: q })
        const transient = /^(verification unavailable|image fetch failed|invalid model output)/.test(check.reasoning || '')
        if (check.verdict === 'no' && !transient) {
          console.log(`[handleGenerateImage] ⚠️ off-brand/off-category (${(check.reasoning || '').slice(0, 90)}) — regenerating once`)
          const retry = await gen(
            `\n\nSTRICT CORRECTION: the previous attempt was off-brand or off-category (${(check.reasoning || '').slice(0, 120)}). ` +
            `Depict ONLY the real ${opts.productDescriptor} from the reference photos — correct material, color and finish, photorealistic, on-category. No copper/brass/gold, no abstract shapes, no text.`,
          )
          if (retry) result = retry
        }
      } catch {
        /* QA is best-effort; a check failure must not lose the image */
      }
    }

    // Upload to Supabase storage
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const buffer = Buffer.from(result.base64, 'base64')
    const path = `proposals/agent_${Date.now()}.${result.mimeType.includes('png') ? 'png' : 'jpg'}`
    await supabase.storage.from('assets').upload(path, buffer, { contentType: result.mimeType, upsert: true })
    const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path)
    return { imageUrl: urlData.publicUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── The Agent ──────────────────────────────────────────

export async function runPresentationAgent(
  input: AgentInput,
  onProgress?: AgentProgressCallback,
): Promise<AgentOutput> {
  const requestId = `pres-agent-${Date.now()}`
  const startTs = Date.now()

  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[PresentationAgent][${requestId}] 🚀 START — brand: "${input.brandName}"`)
  console.log(`[PresentationAgent][${requestId}]    brief: ${input.briefText.length} chars`)
  console.log(`[PresentationAgent][${requestId}]    fileUri: ${input.briefFileUri || 'none'}`)
  console.log(`[PresentationAgent][${requestId}]    wizardData: ${input.wizardData ? Object.keys(input.wizardData).length + ' keys' : 'none'}`)
  console.log(`[PresentationAgent][${requestId}]    images: ${input.images ? Object.keys(input.images).length : 0}`)

  onProgress?.({ stage: 'init', message: 'מאתחל סוכן AI...' })

  const client = getClient()
  const slides: AgentSlide[] = []
  const htmlSlides: string[] = []
  const slideTypes: string[] = []
  // Per-brand visual language — deterministic, so the same brand regenerates
  // consistently but different brands stop looking identical.
  const persona = pickPersona(input.brandName)
  console.log(`[PresentationAgent][${requestId}] 🎭 Visual persona: ${persona}`)
  // Image-variety enforcement: a URL may appear on at most 2 slides; the 3rd
  // use is rejected back to the model with the unused pool.
  const imageUse = new Map<string, number>()
  let totalToolCalls = 0
  let designSystem: PremiumDesignSystem | null = null
  let researchData: Record<string, unknown> | undefined
  let influencerData: Array<{ username: string; followers: number; rationale: string }> | undefined
  let kpiData: Record<string, number> | undefined

  // ── Two-phase tool strategy ──
  // SDK 1.34.0 doesn't support combining built-in tools with function declarations.
  // Phase 1: research with built-in tools (google_search, url_context, code_execution)
  // Phase 2: generate slides with function declarations only
  // Both phases share the same conversation history — no data loss.
  const researchTools: Array<Record<string, unknown>> = [
    { googleSearch: {} },
    { urlContext: {} },
    { codeExecution: {} },
  ]
  const generationTools: Array<Record<string, unknown>> = [
    { functionDeclarations: FUNCTION_DECLARATIONS },
  ]

  // Build the master prompt
  const wizardContext = input.wizardData
    ? `\n\nהנה נתונים שכבר נאספו בוויזרד (השתמש בהם, אל תמציא מחדש):\n${JSON.stringify(input.wizardData, null, 2).slice(0, 20000)}`
    : ''

  const researchContext = input.brandResearch
    ? `\n\nמחקר מותג שכבר בוצע (השתמש בו!):\n${JSON.stringify(input.brandResearch, null, 2).slice(0, 15000)}`
    : ''

  const imagesContext = input.images && Object.keys(input.images).length > 0
    ? `\n\nתמונות זמינות (השתמש ב-URLs האלה בשקפים):\n${Object.entries(input.images).map(([k, v]) => `  - ${k}: ${v}`).join('\n')}`
    : ''

  // Cinematic AI scenes (reference-conditioned on the real product) are the ONLY
  // paste-ready brand imagery. Raw product/catalog photos are NOT offered as
  // paste targets — they read as scraped stock; they serve only as generation
  // references (see brandProductRefs below). Every other visual slide is generated.
  const preferredImageryUrls = (input.brandAssets?.sceneImages ?? []).filter(a => a.status !== 'rejected').map(a => a.url)
  const preferredImageryContext = preferredImageryUrls.length
    ? `\n\nסצנות מותג קולנועיות שכבר יוצרו (AI, מכילות את המוצר האמיתי של הלקוח). השתמש בהן כ-imageUrl לשקפים הוויזואליים המרכזיים. לכל שקף ויזואלי נוסף שדורש תמונה — קרא ל-generate_brand_image עם prompt של סצנה (המוצר האמיתי משולב אוטומטית כרפרנס). לעולם אל תדביק צילום מוצר/קטלוג גולמי כ-imageUrl — הוא נראה כמו סטוק שנשאב מהאינטרנט:\n${preferredImageryUrls.map(u => `  - ${u}`).join('\n')}`
    : '\n\nאין סצנות מוכנות — לכל שקף ויזואלי צור תמונה עם generate_brand_image (המוצר האמיתי של הלקוח משולב אוטומטית כרפרנס). אל תשאיר שקפים ויזואליים ללא תמונה, ואל תדביק צילום קטלוג גולמי.'

  // ── Reference-conditioned image generation (Phase 2) ──
  // Fetch the REAL brand product photos once and feed them as reference images
  // to every generate_brand_image call, so Nano Banana depicts the actual
  // product (correct material/finish) instead of a generic off-brand stand-in.
  const brandRefUrls = (input.brandAssets?.productImages ?? [])
    .filter(a => a.status !== 'rejected')
    .map(a => a.url)
    .slice(0, 4)
  const brandProductRefs: import('./nano-banana-pro').ReferenceImage[] = []
  for (const url of brandRefUrls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!res.ok) continue
      const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase()
      if (!ct.startsWith('image/') || ct.includes('svg')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 1024 || buf.length > 4_000_000) continue
      brandProductRefs.push({ base64: buf.toString('base64'), mimeType: ct, caption: `real ${input.brandName} product — depict this exact product` })
    } catch { /* skip unreachable reference */ }
  }
  let productDescriptor: string | undefined
  try {
    const { extractProductContext } = await import('@/lib/brand/acquire')
    productDescriptor = extractProductContext((input.wizardData as Record<string, unknown>) || {})
  } catch { /* descriptor is optional */ }
  const brandImageConstraint = brandProductRefs.length
    ? `\n\nBRAND FIDELITY (critical): The attached reference image(s) show the REAL ${input.brandName} product${productDescriptor ? ` (${productDescriptor})` : ''}. The generated scene MUST feature THIS exact product faithfully — same material, form and finish. Photorealistic, on-category. NEVER substitute a different-material look-alike (e.g. no copper/brass/gold/enamel when the real product is stainless steel). No abstract art, no invented logos, no text overlays.`
    : (productDescriptor
        ? `\n\nBRAND FIDELITY: Depict the real ${input.brandName} product (${productDescriptor}), photorealistic and on-category. No abstract art, no invented logos, no text overlays.`
        : '')
  const imageGenOpts: ImageGenOpts = { references: brandProductRefs, brandConstraint: brandImageConstraint, productDescriptor }
  console.log(`[PresentationAgent][${requestId}] 🖼️ Reference-conditioning: ${brandProductRefs.length} product refs, descriptor="${productDescriptor || 'none'}"`)

  const currentYear = new Date().getFullYear()
  const systemPrompt = `<role>
אתה סוכן AI שבונה מצגות הצעת מחיר פרימיום עבור סוכנות שיווק המשפיענים Leaders.
אתה אסטרטג, אמן ואנליסט בו-זמנית — ואתה עובד עד שהתוצר גורם ללקוח להגיד "וואו".
</role>

<context>השנה הנוכחית היא ${currentYear}. אל תמציא שנה בשקפים; אם צריך שנה (למשל בשער) — ${currentYear}.</context>

<mission>
מבריף אחד → מצגת שלמה בעברית שמספרת *סיפור אחד*: מעוצבת, מבוססת נתונים,
ובאורך שהסיפור דורש (לא מכסה קבועה). המדד היחיד להצלחה: וואו.
</mission>

<flow>
שלב 1 — מחקר (אם חסר): Google Search + URL Context + IMAI. בסס כל טענה.
${input.brandResearch ? 'מחקר מותג כבר בוצע — השתמש בו. אל תחפש שוב.' : 'חקור את המותג וסרוק את האתר שלהם.'}
שלב 2 — תכנון: קבע Design System (צבעים + פונטים) ואת קשת הסיפור. הצעה עשירה ומפורטת
        (18–24 שקפים בד"כ). ה-beats המחייבים, כשכל beat יכול להתפרש על כמה שקפים:
        cover → brief → goals → audience → INSIGHT(+נתון תומך) → strategy →
        pillars (שקף לכל pillar, שלושה צירים שונים) → bigIdea → creative (2–3 יישומים קונקרטיים) →
        influencers (שקף פרופיל לכל מפתח + why-fit) → competitive (למה אנחנו ולא המתחרים, מהמחקר) →
        timeline (איך הקמפיין רץ, שבוע-אחר-שבוע/שלבים) → deliverables → metrics →
        results (תחזית תוצאות מסומנת-כתחזית, נגזרת מ-reach אמיתי) → closing.
שלב 3 — יצירה: קריאה אחת ל-generate_slide_html לכל שקף, בסדר, עם צבעים ותמונה.
שלב 4 — KPI: code_execution לחישוב CPE/CPM/reach אמיתיים. אל תנחש מספרים.
</flow>

<narrative_development>
המצגת היא סיפור אחד, לא אוסף שקפים. ה-INSIGHT הוא עמוד השדרה — כל שקף אחריו
בונה אליו או פורע אותו:
- הצהרה = התחייבות. תובנה או החלטה שנאמרה בשקף אחד *חייבת* להתפתח בשקפים הבאים:
  קודם נטענת → מוכחת (נתון/דוגמה) → המשמעות שלה → מה שהיא מייצרת בפועל.
- אסור "שקף אי": שקף שמשליך רעיון ולא חוזר אליו. אמרת "היא לא מחכה לכם"? האסטרטגיה,
  ה-pillars והקריאייטיב חייבים להראות *איך בדיוק* עונים על זה.
- Open loops: כל שקף מסיים בשאלה שהשקף הבא עונה עליה — הצופה תמיד רוצה את הבא.
- הד והסלמה: כל חזרה על התובנה מעמיקה אותה, לא חוזרת עליה.
- כל pillar וכל מהלך קריאייטיבי נקשרים במפורש חזרה לתובנה. שקף המדדים מוכיח
  שההימור של התובנה עבד — הוא פירעון הלולאה שנפתחה ב-INSIGHT.
- מוטב שקף נוסף שמפתח רעיון, מאשר לדחוס שלושה רעיונות לשקף אחד.
</narrative_development>

<iron_rules>
1.  כל הטקסט בעברית; שמות מותגים באנגלית.
2.  INSIGHT חד ומבוסס נתון — "אסימון שנופל", לא "השוק משתנה". זהו עמוד השדרה
    שכל השקפים אחריו מפתחים.
3.  STRATEGY קונקרטית — headline + 3 pillars. כל pillar מקבל שקף משלו שמראה *איך*
    הוא משרת את התובנה.
4.  אפס המצאת נתונים. אין נתון? חשב או חפש.
5.  כל שקף = קריאה אחת ל-generate_slide_html. מספר השקפים נגזר מהסיפור (לרוב 14–22),
    לא ממכסה שרירותית. אין תקרה — יש רק "האם זה מוסיף לוואו".
6.  Design System עקבי — אותם צבעים ופונטים בכל השקפים.
7.  כותרות מקס 8 מילים; גוף מקס 40 מילים.
8.  גיוון תמונות (חוק קשיח): לעולם אל תשלח את אותו imageUrl ליותר משקף אחד.
    [המערכת דוחה שימוש שלישי ומחזירה את מאגר התמונות הפנוי.]
9.  כל שקף תוכן חייב לפחות אחד מ: bodyText / bulletPoints / cards / keyNumber.
    כותרת בלבד = שקף מעבר (section divider) שמפריד פרקים בסיפור.
10. עבודה אחת לשקף — הכלל העליון. שקף שמנסה 3 דברים → פצל לשקפים (מותר ורצוי) או חדד.
11. נאמנות לבריף: כל מטרה, KPI, מתחרה ודרישת חובה מופיעים במצגת ומפותחים.
</iron_rules>

<visual_truth>
אמת ויזואלית — הכשל הכי מסוכן במצגת מוצר. תמונה שקרית מזיקה יותר מטקסט חלש.
- לוגו אמיתי בלבד: אסור שעל מוצר יופיע לוגו/סמל ממומצא. תמונת מוצר "גיבורה" (cover, bigIdea,
  deliverables) חייבת להיות המוצר האמיתי של הלקוח מתוך התמונות המאומתות. אין תמונת מוצר אמיתית?
  השתמש ברקע אווירה נטול-מוצר ונטול-לוגו — לעולם אל תייצר מוצר עם לוגו מומצא.
  [רע: מחבת "סולתם" עם זר-דפנה של מותג אופנה. טוב: מחבת הנירוסטה האמיתית מתמונות המותג.]
- התאמת קטגוריה: לפני שתעביר imageUrl, אמור לעצמך מה קטגוריית המותג וּודא שהתמונה ממנה.
  [רע: קדרות חרס למותג נירוסטה/סירי-לחץ. טוב: כלי מתכת שמזוהים עם המותג.]
- תמונת משפיען אמיתית: לשקף פרופיל של משפיען יחיד — imageUrl חייב להיות ה-photoUrl שלו
  מ-search_influencers (הפנים האמיתיות), אף פעם לא תמונה מיוצרת. השתמש ב-displayName כשם
  (לא ב-handle גולמי/אמוג'י), וכל פרופיל נושא keyNumber=followers + keyNumberLabel="עוקבים"
  ומזכיר ER בגוף — עקבי בין כל הפרופילים. [רע: פרופיל "דניאל עמית" עם תמונת מטבח גנרית ובלי מספר.
  טוב: התצלום האמיתי שלה + 524K עוקבים + ER.]
- אפס placeholder: אסור לשלוח לשקף ערך חלקי/דמה — @@, TBD, xxx, lorem, "@handle", שם ריק,
  או מספר עגול בלי מקור. כל handle/שם/מספר מגיע מקריאת כלי אמיתית — אחרת האלמנט לא נוצר.
  [רע: oztelem@@ · טוב: ה-handle האמיתי מ-IMAI, או שהכרטיס פשוט לא עולה.]
- אל תמחזר דימויים: לא אותו imageUrl (חוק ברזל 8) וגם לא תמונה כמעט-זהה בשני שקפים.
  גוון לאורך הדק; ה-closing רשאי להדהד את ה-cover בטיפול הוויזואלי, לא באותו קובץ.
</visual_truth>

<proposal_integrity>
שלמות ההצעה — מה שהופך "שקפים יפים" להצעה שאפשר לחתום עליה.
- תקציב: אם הבריף כולל תקציב — הוא מופיע במצגת (+ CPE/CPM/reach נגזרים בחישוב). הצעה עם
  תוצרים ובלי מחיר אינה הצעה. אין תקציב בבריף? סמן "טרם הוגדר" לצוות — אל תשתיק.
- מטרה↔מדד: לכל מטרה שהוצהרה יש KPI מדיד ומנגנון מדידה. מטרת "מכירות" דורשת מנגנון
  (קודי קופון / UTM / דף נחיתה) — לא רק reach ו-engagement. מטרה בלי דרך למדוד = חור.
- קהל חד: קהל היעד צר והתנהגותי (פסיכוגרפיה + פלטפורמה), לא "כולם 25–65". טווח 40 שנה
  בלי פילוח = דגל אדום → חדד לסגמנט אמיתי.
- עקביות בין שקפים: מספר שהצהרת במילים חייב להתאים למוצג בפועל. אמרת "7 יוצרים"? יופיעו 7.
  יישֵב את המספרים לפני סיום. [רע: כותרת "7 משפיענים", מוצגים 4.]
- רצף שלם: כל רצף ממוספר (שבועות/שלבים/צעדים) רציף ומלא, בלי דילוגים. [רע: שבוע 1 → 3 → 4.]
- מקור לכל סטטיסטיקה חיצונית: נתון צד-ג' מגיע מהמחקר עם מקור בשם ושנה שבאמת תומך בטענה.
  אין אימות → הורד או סמן "טרם אומת". אל תמציא benchmark או ציטוט. [רע: "78% — Nielsen 2023" בלי אימות.]
- הוכחת קריאייטיב: שקף bigIdea/creative *מראה* את הרעיון — תיאור ריל/סטורי/סצנה קונקרטית,
  לא רקע מופשט + פסקה. רעיון שאי אפשר לדמיין ממנו פוסט = לא בשל.
- אפס שקף ריק: כל שקף תוכן נושא חומר אמיתי. פתחת סקשן (סיכונים/תקציב)? מלא אותו או הסר.
- תווית = תוכן: ה-eyebrow/סימן-המים של השקף תואם לסקשן שלו. אל תשאיר תווית שהועתקה משקף אחר.
  [רע: שקף "ניהול סיכונים" עם סימן-מים "INSIGHT".]
</proposal_integrity>

<anti_ai_patterns>
אל: כותרת שמתארת קטגוריה · בולטים שמתחילים ב"יצירת/הגברת" · אותו מבנה בכל שקף ·
מילים שחוזרות בין שקפים · כרטיסים באותו אורך בדיוק · שקף שמצהיר רעיון ולא מפתח אותו.
</anti_ai_patterns>

<self_check>
לפני שאתה מסיים, עבור על הרשימה ותקן כל כשל:
(1) כל מטרה מהבריף מכוסה? (2) ה-INSIGHT מפתיע ומגובה במספר?
(3) כל תובנה/החלטה שהוצהרה — פותחה והוכחה בשקפים הבאים ולא נשארה "שקף אי"?
(4) הלולאה שנפתחה ב-INSIGHT נפרעת בסוף? (5) imageUrl כפול או כמעט-זהה? (6) מספר ממומצא?
(7) לוגו מומצא על מוצר, או תמונה מקטגוריה זרה? (8) placeholder כלשהו (@@/TBD/שם או handle חלקי)?
(9) תקציב מופיע (אם היה בבריף)? (10) לכל מטרה יש KPI ומנגנון מדידה?
(11) כל מספר שנאמר במילים תואם למוצג בפועל (7=7)? (12) כל רצף ממוספר רציף בלי דילוג?
(13) כל תווית/סימן-מים תואמת לסקשן, ואין שקף תוכן ריק?
כל "כן/לא" בעייתי → תקן לפני מסירה.
</self_check>

## פורמט סיום:
אחרי שיצרת את כל השקפים (כמה שהסיפור דרש), סכם ב-JSON:
{
  "designSystem": { "colors": {...}, "fonts": {...}, "effects": {...}, "creativeDirection": {...} },
  "summary": "סיכום בעברית של ההצעה"
}${input.blueprintMandate ? `\n\n${input.blueprintMandate}` : ''}${input.wizardContract?.promptBlock ? `\n\n${input.wizardContract.promptBlock}` : ''}

${ART_DIRECTOR_RULES}`

  const userPrompt = `בנה מצגת הצעת מחיר עבור המותג "${input.brandName}".

## בריף:
${input.briefText.slice(0, 8000)}
${wizardContext}
${researchContext}
${imagesContext}
${preferredImageryContext}

המשימה: חקור → תכנן Design System + קשת סיפור (כמה שקפים שהסיפור דורש, לרוב 14–22) → צור אותם אחד אחד, בסדר, כשכל תובנה מתפתחת בשקפים שאחריה. התחל עכשיו.`

  // Build contents — support Files API
  let contents: unknown
  if (input.briefFileUri && input.briefFileMime) {
    contents = [{
      role: 'user',
      parts: [
        { fileData: { mimeType: input.briefFileMime, fileUri: input.briefFileUri } },
        { text: userPrompt },
      ],
    }]
    console.log(`[PresentationAgent][${requestId}] 📄 Using Files API for brief`)
  } else {
    contents = userPrompt
  }

  // ── Agent Loop ──────────────────────────────────────────

  const history: Array<{ role: string; parts: Array<Record<string, unknown>> }> = []
  if (Array.isArray(contents)) {
    history.push(contents[0] as any)
  } else {
    history.push({ role: 'user', parts: [{ text: contents as string }] })
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 1: Research — built-in tools (google_search, url_context, code_execution)
  // The model researches the brand, discovers competitors, scrapes the website.
  // No function declarations here — avoids the SDK limitation.
  // ════════════════════════════════════════════════════════════

  const needsResearch = !input.brandResearch
  if (needsResearch) {
    console.log(`[PresentationAgent][${requestId}] 📚 Phase 1: Research (built-in tools)`)
    onProgress?.({ stage: 'research', message: '🔍 חוקר את המותג...' })

    const researchConfig: GenerateContentConfig = {
      systemInstruction: systemPrompt,
      thinkingConfig: { thinkingLevel: 'HIGH' as any },
      maxOutputTokens: 16000,
      tools: researchTools,
    } as GenerateContentConfig

    const researchPrompt = `חקור את "${input.brandName}" בשוק הישראלי. חפש באינטרנט וסרוק את האתר.
מצא ובסס במספרים + URLs:
1. תעשייה, מתחרים בשם, מיצוב
2. קהל יעד אמיתי (פסיכולוגיה, לא רק דמוגרפיה)
3. נוכחות דיגיטלית — ומה עובד להם
4. ערכי מותג, טון, סגנון ויזואלי
5. צבעים עיקריים (primary, accent)
בריף: ${input.briefText.slice(0, 2000)}
סכם בפסקאות בעברית עם נתונים ומקורות. נתון לא נמצא → אמור זאת, אל תמציא.`

    try {
      const researchResponse: any = await client.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: researchPrompt,
        config: researchConfig,
      })

      const researchText = researchResponse.text || ''
      console.log(`[PresentationAgent][${requestId}] ✅ Research complete: ${researchText.length} chars`)

      // Inject research into history so Phase 2 has full context
      history.push({ role: 'user', parts: [{ text: `מחקר מותג שנאסף:\n\n${researchText}\n\nעכשיו בנה את המצגת לפי קשת הסיפור, כשכל תובנה מתפתחת בשקפים הבאים ומספר השקפים נגזר מהסיפור (לא ממכסה). קרא ל-generate_slide_html לכל שקף בסדר.` }] })
    } catch (researchErr) {
      console.warn(`[PresentationAgent][${requestId}] ⚠️ Research failed (continuing without):`, researchErr instanceof Error ? researchErr.message : researchErr)
      history.push({ role: 'user', parts: [{ text: `לא הצלחתי לחקור — השתמש במידע מהבריף בלבד. בנה את המצגת לפי קשת הסיפור, כשמספר השקפים נגזר מהסיפור (לא ממכסה). קרא ל-generate_slide_html לכל שקף בסדר.` }] })
    }
  } else {
    console.log(`[PresentationAgent][${requestId}] ℹ️ Phase 1 skipped — brandResearch already provided`)
    // Add instruction to generate slides immediately
    history.push({ role: 'user', parts: [{ text: `מחקר מותג כבר קיים. בנה את המצגת עכשיו לפי קשת הסיפור (cover → ... → closing), כשכל תובנה מתפתחת בשקפים הבאים ומספר השקפים נגזר מהסיפור, לא ממכסה.` }] })
  }

  // ════════════════════════════════════════════════════════════
  // PHASE 2: Generate slides — function declarations only
  // The model calls generate_slide_html, search_influencers, etc.
  // Research context is already in history from Phase 1.
  // ════════════════════════════════════════════════════════════

  console.log(`[PresentationAgent][${requestId}] 🎨 Phase 2: Generate slides (function calling)`)
  onProgress?.({ stage: 'generating', message: '🎨 מתחיל ליצור שקפים...' })

  const genConfig: GenerateContentConfig = {
    systemInstruction: systemPrompt,
    thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
    maxOutputTokens: 65536,
    tools: generationTools,
  } as GenerateContentConfig

  const MAX_ITERATIONS = 45 // up to ~22 slides + IMAI/image/code tool calls + buffer

  // The brief may be attached as a Gemini Files API reference (fileData).
  // Those files EXPIRE after 48h — regenerating an old deck then 403s
  // ("permission to access the File …"). If that happens, drop the file and
  // fall back to the inline briefText so generation still succeeds.
  let fileFallbackDone = false
  const looksLikeFileError = (e: unknown): boolean => {
    const m = (e instanceof Error ? e.message : String(e)).toLowerCase()
    return m.includes('permission') || m.includes('the file') || m.includes('403') || m.includes('not exist')
  }
  const dropBriefFile = (): boolean => {
    const first = history[0]
    if (!first || !Array.isArray(first.parts)) return false
    const hadFile = first.parts.some((p) => (p as Record<string, unknown>).fileData)
    if (!hadFile) return false
    first.parts = [{ text: userPrompt }]
    console.warn(`[PresentationAgent][${requestId}] ⚠️ Brief file expired/inaccessible — falling back to briefText`)
    return true
  }

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const iterStart = Date.now()
    console.log(`[PresentationAgent][${requestId}] 🔁 Iteration ${iter + 1}/${MAX_ITERATIONS} (${slides.length} slides, ${totalToolCalls} tool calls)`)

    let response: any
    try {
      response = await client.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: history as any,
        config: genConfig,
      })
    } catch (callErr) {
      // One-time recovery: stale brief file → drop it and retry this iteration.
      if (!fileFallbackDone && looksLikeFileError(callErr) && dropBriefFile()) {
        fileFallbackDone = true
        response = await client.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: history as any,
          config: genConfig,
        })
      } else {
        throw callErr
      }
    }

    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    console.log(`[PresentationAgent][${requestId}]   ⏱️ ${Date.now() - iterStart}ms, parts=${parts.length}, functionCalls=${functionCalls.length}`)

    if (functionCalls.length === 0) {
      // Agent finished — extract final text + designSystem
      const finalText = parts.filter((p: any) => p.text).map((p: any) => p.text).join('')
      console.log(`[PresentationAgent][${requestId}] ✅ Phase 2 finished: ${slides.length} slides, ${totalToolCalls} tool calls, ${Date.now() - startTs}ms`)

      // Try to parse design system from final response
      try {
        const jsonMatch = finalText.match(/\{[\s\S]*"designSystem"[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          if (parsed.designSystem) designSystem = parsed.designSystem
        }
      } catch { /* ok — use default */ }

      // Keep the closing model turn in history so the repair pass (if any)
      // continues a well-formed conversation.
      if (parts.length) history.push({ role: 'model', parts })

      break
    }

    // Process function calls
    history.push({ role: 'model', parts })

    const responseParts: Array<Record<string, unknown>> = []
    for (const part of functionCalls) {
      const fc = part.functionCall
      const name = fc.name as string
      const args = fc.args || {}
      totalToolCalls++

      console.log(`[PresentationAgent][${requestId}]   🔧 ${name}(${JSON.stringify(args).slice(0, 150)})`)

      let result: unknown

      try {
        switch (name) {
          case 'search_influencers': {
            onProgress?.({ stage: 'research', message: '🔍 מחפש משפיענים ב-IMAI...' })
            const keywords = (args.keywords as string[]) || []
            const influencers = await searchIsraeliInfluencers(keywords, {
              platform: (args.platform as 'instagram' | 'tiktok') || 'instagram',
              minFollowers: (args.minFollowers as number) || 5000,
              maxFollowers: (args.maxFollowers as number) || 500000,
              limit: (args.limit as number) || 10,
            })
            // Re-host each real profile photo (IMAI/IG CDN URLs expire within
            // hours) + clean the raw display name, so influencer profile slides
            // can show the real face with a stable URL and a client-ready name.
            const { rehostImage, cleanInfluencerName } = await import('@/lib/brand/rehost-image')
            const { createClient: createSbForPhotos } = await import('@/lib/supabase/server')
            const sbPhotos = await createSbForPhotos()
            const enriched = await Promise.all(influencers.slice(0, 10).map(async i => ({
              username: i.username,
              displayName: cleanInfluencerName(i.fullname, i.username),
              followers: i.followers,
              engagement_rate: i.engagement_rate,
              avg_likes: i.avg_likes,
              is_verified: i.is_verified,
              photoUrl: i.picture
                ? (await rehostImage(i.picture, 'influencers', i.username || 'inf', sbPhotos)) || undefined
                : undefined,
            })))
            result = enriched
            influencerData = enriched.slice(0, 8).map(e => ({
              username: e.username, followers: e.followers,
              rationale: `${e.displayName} — ${(e.followers ?? 0).toLocaleString()} עוקבים, ER ${e.engagement_rate}%`,
            }))
            const withPhoto = enriched.filter(e => e.photoUrl).length
            console.log(`[PresentationAgent][${requestId}]     → ${enriched.length} influencers found (${withPhoto} with re-hosted photo)`)
            break
          }

          case 'get_influencer_audience': {
            onProgress?.({ stage: 'research', message: `📊 בודק קהל של @${args.username}...` })
            const report = await getAudienceReport(args.username as string, (args.platform as any) || 'instagram')
            result = {
              username: report.user_profile.username,
              followers: report.user_profile.followers,
              er: report.user_profile.engagement_rate,
              genders: report.audience_followers?.data?.audience_genders,
              ages: report.audience_followers?.data?.audience_ages,
              credibility: report.audience_followers?.data?.audience_credibility,
            }
            break
          }

          case 'generate_slide_html': {
            const slideType = args.slideType as string
            const slideTitle = args.title as string
            const slideIndex = slides.length

            // Image-variety gate: reject the 3rd use of the same URL and hand
            // the model the still-unused pool so it can retry immediately.
            const imgUrl = ((args.imageUrl as string) || '').trim()
            if (imgUrl && (imageUse.get(imgUrl) ?? 0) >= 2) {
              const unused = preferredImageryUrls.filter(u => !imageUse.has(u)).slice(0, 10)
              console.log(`[PresentationAgent][${requestId}]     ✋ Rejected reused image on ${slideType} (already used twice)`)
              result = {
                success: false,
                error: 'התמונה הזו כבר בשימוש בשני שקפים. קרא שוב ל-generate_slide_html לאותו שקף עם תמונה אחרת מהרשימה, או צור חדשה עם generate_brand_image, או השמט imageUrl.',
                unusedImages: unused,
              }
              break
            }
            if (imgUrl) imageUse.set(imgUrl, (imageUse.get(imgUrl) ?? 0) + 1)

            onProgress?.({
              stage: 'generating',
              message: `🎨 מייצר שקף ${slideIndex + 1}: ${slideType}`,
              slideIndex,
            })

            const html = renderAgentSlide(args, { persona, slideIndex, brandName: input.brandName })
            const content: Record<string, unknown> = { ...args }
            delete content.designColors
            slides.push({ slideType, title: slideTitle, html, content })
            htmlSlides.push(html)
            slideTypes.push(slideType)

            console.log(`[PresentationAgent][${requestId}]     → Slide ${slideIndex + 1}: ${slideType} "${slideTitle}" (${html.length} chars)`)
            result = { success: true, slideIndex, slideType, htmlLength: html.length }
            break
          }

          case 'generate_brand_image': {
            onProgress?.({ stage: 'images', message: '🎨 מייצר תמונה...' })
            result = await handleGenerateImage(args, imageGenOpts)
            console.log(`[PresentationAgent][${requestId}]     → Image: ${JSON.stringify(result).slice(0, 100)}`)
            break
          }

          default:
            result = { error: `Unknown function: ${name}` }
        }
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
        console.error(`[PresentationAgent][${requestId}]     ❌ ${name} failed:`, result)
      }

      responseParts.push({
        functionResponse: { name, response: { result } },
      })
    }

    history.push({ role: 'user', parts: responseParts })
  }

  // ── Default Design System if agent didn't provide one ──
  if (!designSystem) {
    designSystem = {
      colors: {
        primary: '#E94560', secondary: '#1A1A2E', accent: '#E94560',
        background: '#0C0C10', text: '#F5F5F7', cardBg: 'rgba(255,255,255,0.05)',
        muted: 'rgba(245,245,247,0.5)',
      },
      typography: { headingSize: 64, bodySize: 22 },
      effects: { borderRadius: 'soft', borderRadiusValue: 16, shadowStyle: 'glow', decorativeStyle: 'minimal' },
      fonts: { heading: 'Heebo', body: 'Heebo' },
      direction: 'rtl',
    } as PremiumDesignSystem
  }

  // ── Design-system hardening (art-director rules: contrast floors, Hebrew fonts) ──
  try {
    const { issues, corrected } = auditDesignSystem({
      colors: ((designSystem as PremiumDesignSystem).colors ?? {}) as unknown as Record<string, string>,
      fonts: (designSystem as PremiumDesignSystem).fonts as unknown as Record<string, string> | undefined,
    })
    if (issues.length) {
      console.warn(
        `[PresentationAgent][${requestId}] 🎨 Design-system audit corrected ${issues.length} issue(s): ` +
          issues.map(i => `${i.field}: ${i.problem} → ${i.fix}`).join(' | '),
      )
    }
    designSystem = {
      ...designSystem,
      colors: { ...(designSystem as PremiumDesignSystem).colors, ...corrected.colors },
      ...(corrected.fonts ? { fonts: { ...(designSystem as PremiumDesignSystem).fonts, ...corrected.fonts } } : {}),
    } as PremiumDesignSystem
  } catch (auditErr) {
    console.warn(`[PresentationAgent][${requestId}] ⚠️ Design-system audit failed (using unaudited):`, auditErr instanceof Error ? auditErr.message : auditErr)
  }

  // ── Wizard-coverage check + ONE targeted repair pass ──
  // Missing binding items → a single follow-up conversation that regenerates
  // ONLY the affected slides. Residual misses are returned for editor flags —
  // coverage failures never block generation.
  let wizardCoverage: CoverageResult | undefined
  if (input.wizardContract?.items?.length) {
    const coverageSlides = () =>
      slides.map(s => ({ slideType: s.slideType, slots: s.content ?? { title: s.title } }))
    try {
      let coverage = checkWizardCoverage(coverageSlides(), input.wizardContract)
      console.log(`[PresentationAgent][${requestId}] 📋 Wizard coverage:\n${coverage.report}`)

      // Wall-clock guard: repair is OPTIONAL — it must never spend the time the
      // caller needs to persist the deck. Capped at 120s and at input.deadlineTs.
      const repairDeadline = Math.min(
        input.deadlineTs ?? Number.POSITIVE_INFINITY,
        Date.now() + 120_000,
      )
      if (coverage.missing.length > 0 && slides.length > 0 && repairDeadline - Date.now() < 30_000) {
        console.warn(`[PresentationAgent][${requestId}] 🔧 Repair skipped — under 30s left before deadline`)
      } else if (coverage.missing.length > 0 && slides.length > 0) {
        onProgress?.({ stage: 'repair', message: `🔧 משלים ${coverage.missing.length} פריטי ויזארד חסרים...` })
        // Map contract slide aliases to the generate_slide_html enum and drop
        // anything the tool can't produce ('stats' → 'metrics', unknown → out).
        const SLIDE_TYPE_ENUM = ['cover', 'brief', 'goals', 'audience', 'insight', 'strategy', 'bigIdea', 'deliverables', 'influencers', 'metrics', 'closing']
        const SLIDE_TYPE_ALIASES: Record<string, string> = { stats: 'metrics', numbers: 'metrics', kpis: 'metrics' }
        const targetTypes = Array.from(new Set(
          coverage.missing
            .flatMap(m => m.mustAppearIn)
            .map(t => SLIDE_TYPE_ALIASES[t] ?? t)
            .filter(t => SLIDE_TYPE_ENUM.includes(t)),
        ))
        const missingLines = coverage.missing.map(m => {
          const v = Array.isArray(m.value) ? m.value.join(' | ') : m.value
          return `- ${m.requirement} [שקף: ${m.mustAppearIn.join('/')}]: ${v}`
        })
        history.push({
          role: 'user',
          parts: [{
            text:
              `בקרת איכות אוטומטית: הפריטים המחייבים הבאים מהוויזארד חסרים מהמצגת:\n${missingLines.join('\n')}\n\n` +
              `תקן עכשיו: קרא ל-generate_slide_html מחדש אך ורק עבור השקפים: ${targetTypes.join(', ')}.\n` +
              `- צור כל שקף מחדש בשלמותו — אותם צבעים ואותו סגנון.\n` +
              `- שבץ את הפריטים במדויק (מספרים וציטוטים כלשונם).\n` +
              `- אל תיגע בשקפים אחרים. אל תשנה את ה-Design System.\n` +
              `- ערכים אמיתיים בלבד — אין @@/placeholder, אין לוגו מומצא על מוצר, וכל תווית תואמת לסקשן.`,
          }],
        })

        const MAX_REPAIR_ITERATIONS = 4
        for (let iter = 0; iter < MAX_REPAIR_ITERATIONS; iter++) {
          if (Date.now() >= repairDeadline) {
            console.warn(`[PresentationAgent][${requestId}] 🔧 Repair aborted at iteration ${iter} — deadline reached`)
            break
          }
          const response: any = await client.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: history as any,
            config: genConfig,
          })
          const parts = response.candidates?.[0]?.content?.parts || []
          const functionCalls = parts.filter((p: any) => p.functionCall)
          if (functionCalls.length === 0) break

          history.push({ role: 'model', parts })
          const responseParts: Array<Record<string, unknown>> = []
          for (const part of functionCalls) {
            const fc = part.functionCall
            totalToolCalls++
            let result: unknown
            if (fc.name === 'generate_slide_html') {
              const args = fc.args || {}
              const slideType = args.slideType as string
              const idx = slideTypes.indexOf(slideType)
              const html = renderAgentSlide(args, {
                persona,
                slideIndex: idx >= 0 ? idx : slides.length,
                brandName: input.brandName,
              })
              const content: Record<string, unknown> = { ...args }
              delete content.designColors
              if (idx >= 0) {
                slides[idx] = { slideType, title: (args.title as string) || slides[idx].title, html, content }
                htmlSlides[idx] = html
                console.log(`[PresentationAgent][${requestId}]   🔧 Repaired slide ${idx + 1} (${slideType})`)
                result = { success: true, replaced: true, slideIndex: idx, slideType }
              } else {
                // New slide type — insert BEFORE the closing slide so the
                // deck's narrative order survives the repair (never append
                // content after the CTA).
                const closingIdx = slideTypes.indexOf('closing')
                const insertAt = closingIdx >= 0 ? closingIdx : slides.length
                slides.splice(insertAt, 0, { slideType, title: (args.title as string) || '', html, content })
                htmlSlides.splice(insertAt, 0, html)
                slideTypes.splice(insertAt, 0, slideType)
                console.log(`[PresentationAgent][${requestId}]   🔧 Repair inserted missing slide (${slideType}) at ${insertAt + 1}`)
                result = { success: true, replaced: false, slideIndex: insertAt, slideType }
              }
            } else {
              result = { error: `Only generate_slide_html is allowed during repair (got ${fc.name})` }
            }
            responseParts.push({ functionResponse: { name: fc.name, response: { result } } })
          }
          history.push({ role: 'user', parts: responseParts })
        }

        coverage = checkWizardCoverage(coverageSlides(), input.wizardContract)
        console.log(`[PresentationAgent][${requestId}] 📋 Post-repair coverage: ${coverage.missing.length} still missing`)
      }
      wizardCoverage = coverage
    } catch (covErr) {
      console.warn(`[PresentationAgent][${requestId}] ⚠️ Wizard coverage check failed (continuing):`, covErr instanceof Error ? covErr.message : covErr)
    }
  }

  // ── Inject logos ──
  // Default to the dark wordmark served from /public on the app origin.
  // Callers can still override via input.leadersLogoUrl.
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://leaders-platform.vercel.app')).replace(/\/$/, '')
  const leadersLogo = input.leadersLogoUrl || `${appBase}/new_logo.svg`
  const clientLogo = input.clientLogoUrl || ''

  const finalHtml = htmlSlides.map((html, i) => {
    let patched = html
    const slideType = slideTypes[i] || ''
    const isHero = slideType === 'cover' || slideType === 'closing'
    // A soft drop-shadow keeps a dark/light logo legible over any photo or scrim.
    const legible = 'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));'
    // Leaders logo (agency) — bottom-left, subtle everywhere.
    if (leadersLogo && !patched.includes('leaders-logo')) {
      const logoTag = `<img src="${leadersLogo}" alt="Leaders" style="position:absolute;bottom:30px;left:40px;height:40px;opacity:0.85;z-index:10;${legible}" />`
      patched = patched.replace('</div></body>', `${logoTag}</div></body>`)
    }
    // Client logo (brand) — a proper lockup on the cover/closing (larger, top-center),
    // a subtle co-brand mark (top-right) on content slides.
    if (clientLogo && !patched.includes(clientLogo)) {
      const clientTag = isHero
        ? `<img src="${clientLogo}" alt="${input.brandName.replace(/"/g, '&quot;')}" style="position:absolute;top:56px;left:50%;transform:translateX(-50%);height:74px;max-width:420px;object-fit:contain;opacity:0.98;z-index:11;${legible}" />`
        : `<img src="${clientLogo}" alt="${input.brandName.replace(/"/g, '&quot;')}" style="position:absolute;top:30px;right:40px;height:48px;max-width:220px;object-fit:contain;opacity:0.92;z-index:10;${legible}" />`
      patched = patched.replace('</div></body>', `${clientTag}</div></body>`)
    }
    return patched
  })

  const durationMs = Date.now() - startTs
  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)
  console.log(`[PresentationAgent][${requestId}] ✅ DONE — ${finalHtml.length} slides, ${totalToolCalls} tool calls, ${durationMs}ms`)
  console.log(`[PresentationAgent][${requestId}] ═══════════════════════════════════════`)

  onProgress?.({ stage: 'done', message: `✅ מצגת מוכנה — ${finalHtml.length} שקפים`, totalSlides: finalHtml.length })

  return {
    designSystem,
    slides,
    htmlSlides: finalHtml,
    slideTypes,
    research: researchData,
    influencers: influencerData,
    kpis: kpiData,
    wizardCoverage,
    totalToolCalls,
    durationMs,
  }
}
