/**
 * Assemble a deck `documents.data` payload from a completed kickoff
 * (inner_meeting_forms) plus, when linkable, the original client brief
 * (document_links.metadata.submission_data).
 *
 * The presentation agent (POST /api/generate-full) reads `brandName` +
 * `_briefText` as its primary input and self-researches the rest (brand +
 * live IMAI influencers). We therefore fold ALL kickoff + brief content into
 * one richly-labelled Hebrew `_briefText` block — the kickoff already holds
 * the creative crack (insight / strategy / creative / media), so this is
 * enough to drive a full creative deck with no wizard.
 *
 * `_autoPipeline` marks the deck as pipeline-generated so downstream steps
 * (Canva export, Salesforce push in Phase 2) can recognise it.
 */

/** Subset of inner_meeting_forms columns we read for the deck. */
export interface KickoffFields {
  client_name?: string | null
  about_brand?: string | null
  target_audiences?: string | null
  goals?: string | null
  insight?: string | null
  strategy?: string | null
  creative?: string | null
  creative_presentation?: string | null
  media_strategy?: string | null
  influencers_example?: string | null
  budget_distribution?: string | null
  additional_notes?: string | null
}

export interface KickoffDeckSources {
  clientName: string
  projectName?: string | null
  salesforceRef: string
  kickoff: KickoffFields
  /** document_links.metadata.submission_data (client-brief FormData) or null. */
  brief?: Record<string, unknown> | null
}

export interface AssembledDeck {
  title: string
  data: Record<string, unknown>
}

/** Coerce a field (string | string[] | other) to trimmed display text. */
const toText = (v: unknown): string =>
  Array.isArray(v)
    ? v.filter(Boolean).map(String).join(', ')
    : typeof v === 'string'
      ? v.trim()
      : v == null
        ? ''
        : String(v)

/** A labelled section, or '' when the value is empty (so it's dropped). */
const section = (label: string, value: unknown): string => {
  const s = toText(value)
  return s ? `## ${label}\n${s}\n` : ''
}

/** Build the labelled Hebrew brief text the presentation agent consumes. */
export function composeBriefText(src: KickoffDeckSources): string {
  const k = src.kickoff
  const b = (src.brief ?? {}) as Record<string, unknown>
  const parts: string[] = [
    `# בריף ליצירת מצגת — ${src.clientName}${src.projectName ? ` (${src.projectName})` : ''}\n`,
    '# מסמך התנעה (פגישה פנימית)',
    section('על המותג', k.about_brand),
    section('קהלי יעד', k.target_audiences),
    section('מטרות', k.goals),
    section('תובנה (Insight)', k.insight),
    section('אסטרטגיה', k.strategy),
    section('קריאייטיב / פיצוח', k.creative),
    section('הצגת קריאייטיב', k.creative_presentation),
    section('אסטרטגיית מדיה', k.media_strategy),
    section('דוגמאות משפיענים', k.influencers_example),
    section('חלוקת תקציב', k.budget_distribution),
    section('הערות נוספות', k.additional_notes),
  ]

  if (src.brief && Object.keys(b).length > 0) {
    parts.push(
      '\n# בריף לקוח (מקורי)',
      section('מוצר/שירות', b.productService),
      section('קטגוריית שוק', b.marketCategory),
      section('תיאור המוצר', b.productDescription),
      section('מתחרים', b.competitors),
      section('אתגר', b.challenge),
      section('קהל יעד', b.targetAudience),
      section('מאפייני קהל', b.audienceCharacteristics),
      section('תובנות קהל', b.audienceInsights),
      section('מטרות הקמפיין', b.campaignGoalsDescription),
      section('תובנה', b.insight),
      section('פתרון', b.solution),
      section('מסר מרכזי', b.mainMessage),
      section('Key Takeaway', b.keyTakeaway),
      section('פלטפורמות', b.platforms),
      section('שירותים', b.services),
      section('תקציב', b.budget),
      section('דרישות', b.requirements),
      section('הערות', b.notes),
    )
  }

  return parts.filter(Boolean).join('\n')
}

/** Build the `{ title, data }` for a new deck `documents` row. */
export function assembleDeckData(src: KickoffDeckSources): AssembledDeck {
  const brandName = (src.clientName || src.projectName || 'לקוח').toString().trim()
  return {
    title: `מצגת — ${brandName}`,
    data: {
      brandName,
      _briefText: composeBriefText(src),
      _autoPipeline: true,
      _pipelineSource: 'kickoff',
      salesforce_ref: src.salesforceRef,
      ...(src.projectName ? { _projectName: src.projectName } : {}),
    },
  }
}
