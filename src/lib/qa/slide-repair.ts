/**
 * In-context slide repair — rewrite one slide while seeing the whole deck.
 *
 * Why this exists: the critique loop originally repaired through
 * /api/regenerate-slide, which rebuilds a slide in isolation. It receives that
 * slide and an instruction and nothing else, which makes three of the critic's
 * checks structurally unfixable:
 *
 *   - notRedundant   — it cannot see the slide it is duplicating
 *   - contradictions — it cannot see the slide it contradicts
 *   - hebrewQuality  — each isolated rewrite reintroduces fresh drift
 *
 * Measured over four rounds on a 22-slide deck: failures went 3 → 2 → 3 → 4.
 * Slides 4 and 19 failed in every round despite being repaired in every round,
 * and "the deck contradicts itself" appeared only AFTER repairs began. The loop
 * was actively degrading the deck, and the best version was thrown away.
 *
 * So repair here gets the full deck as context and rewrites one slide against
 * it. Slides are repaired sequentially, each seeing the previous repairs, so a
 * contradiction resolved on one slide stays resolved on the next.
 *
 * Never throws: a failed repair leaves the original slide untouched, which is
 * strictly better than replacing it with something worse.
 */

import { callAI } from '@/lib/ai-provider'
import { extractSlideText } from '@/lib/qa/content-critic'

export interface RepairInput {
  /** Current HTML of the slide being repaired. */
  slideHtml: string
  slideIndex: number
  slideType?: string
  /** Every slide's visible text, in order — the context isolation lacked. */
  allSlideTexts: string[]
  /** The brief + kickoff the deck must stay grounded in. */
  sourceMaterial: string
  brandName: string
  /** Checks that failed, the critic's quoted issues, and its rewrite directive. */
  failedChecks: string[]
  issues: string[]
  rewrite: string
  /** Deck-level issues (contradictions, arc) — repair must not re-create them. */
  deckIssues?: string[]
  model?: string
  budgetMs?: number
}

/** Trim the deck context so a long deck cannot crowd out the instructions. */
function deckContext(texts: string[], selfIndex: number): string {
  return texts
    .map((t, i) => {
      const label = i === selfIndex ? `SLIDE ${i} (this is the one being rewritten)` : `SLIDE ${i}`
      return `${label}: ${(t || '(empty)').slice(0, 320)}`
    })
    .join('\n')
}

function buildRepairPrompt(input: RepairInput): string {
  return `<role>
You rewrite ONE slide of a Hebrew (RTL) client presentation. You can see the entire deck, so your rewrite must fit it — not just satisfy a note in isolation.
</role>

<source-material>
${input.sourceMaterial?.trim().slice(0, 4000) || '(none supplied)'}
</source-material>

<deck brand="${input.brandName}">
${deckContext(input.allSlideTexts, input.slideIndex)}
</deck>

${input.deckIssues?.length ? `<deck-level-problems>\n${input.deckIssues.map((i) => `- ${i}`).join('\n')}\n</deck-level-problems>\n` : ''}
<slide-to-rewrite index="${input.slideIndex}" type="${input.slideType || 'unknown'}">
${input.slideHtml}
</slide-to-rewrite>

<critique>
Failed checks: ${input.failedChecks.join(', ') || '(unspecified)'}
Issues: ${input.issues.map((i) => `- ${i}`).join('\n') || '(none quoted)'}
Required change: ${input.rewrite}
</critique>

<rules>
- Fix exactly what the critique names. Do not redesign a slide that was only criticised on wording.
- Every claim must trace to the SOURCE MATERIAL, or be phrased plainly as our proposal. Invent nothing — no frameworks, tiers, systems, services, awards or figures that the source does not contain.
- Do not repeat a point another slide in the deck already makes, and do not contradict one (budget, audience, goals, timing must stay consistent across the deck).
- Hebrew only, including headings, labels and eyebrows. No English words left in.
- Keep the existing visual structure, layout, classes, data-role attributes and colours. This is a CONTENT rewrite.
- Keep every <img> src EXACTLY as it is. Never introduce a new image URL.
- Return the COMPLETE slide HTML document, not a fragment or a diff.
</rules>

Return JSON only: {"html": "<!DOCTYPE html>..."}`
}

const IMG_SRC_RE = /<img[^>]+src="([^"]+)"/g
const EYEBROW_RE = /(<div\b[^>]*\bclass="eyebrow"[^>]*>)([\s\S]*?)(<\/div>)/i

function imageSrcs(html: string): string[] {
  return Array.from(html.matchAll(IMG_SRC_RE)).map((m) => m[1])
}

/**
 * Rewrite one slide in full-deck context. Returns the new HTML, or null when
 * the repair could not be trusted — in which case the caller keeps the
 * original.
 */
export async function repairSlideInContext(input: RepairInput): Promise<string | null> {
  try {
    const res = await Promise.race([
      callAI({
        model: input.model || 'gemini-3.1-pro-preview',
        prompt: buildRepairPrompt(input),
        systemPrompt:
          'You are a meticulous Hebrew copy editor for premium client presentations. Return ONLY valid JSON with an "html" field containing the complete slide document.',
        callerId: `slide-repair-${input.slideIndex}`,
        maxOutputTokens: 32_000,
        geminiConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            required: ['html'],
            properties: { html: { type: 'string' } },
          } as never,
          maxOutputTokens: 32_000,
        },
      }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error('slide repair timed out')), input.budgetMs ?? 120_000),
      ),
    ])

    let html = (JSON.parse(res?.text || '{}') as { html?: string }).html
    if (!html || !/<html[\s>]/i.test(html)) {
      console.warn(`[slide-repair] slide ${input.slideIndex}: model returned no usable document`)
      return null
    }

    // A repair that drops the slide's imagery, or swaps in a URL of its own,
    // is a regression however good the copy is — the provenance gate that
    // keeps stock photos out of the deck does not run on this path.
    const before = imageSrcs(input.slideHtml)
    const after = imageSrcs(html)
    if (before.length && after.join('|') !== before.join('|')) {
      console.warn(`[slide-repair] slide ${input.slideIndex}: imagery changed (${before.length}→${after.length}) — rejecting`)
      return null
    }

    // Guard against a "repair" that quietly guts the slide.
    const beforeLen = extractSlideText(input.slideHtml).length
    const afterLen = extractSlideText(html).length
    if (beforeLen > 200 && afterLen < beforeLen * 0.4) {
      console.warn(`[slide-repair] slide ${input.slideIndex}: text collapsed ${beforeLen}→${afterLen} chars — rejecting`)
      return null
    }

    // Keep the eyebrow. It is a design element the critique never asked to
    // change, yet a rewrite blanked one while fixing a fabricated name. Restore
    // the original when the repair emptied or dropped it; the renumbering pass
    // corrects its number afterwards.
    const originalEyebrow = input.slideHtml.match(EYEBROW_RE)
    if (originalEyebrow && originalEyebrow[2].replace(/<[^>]+>/g, '').trim()) {
      const repairedEyebrow = html.match(EYEBROW_RE)
      if (!repairedEyebrow) {
        const restored = originalEyebrow[0]
        html = html.replace(/<body[^>]*>/i, (bodyTag) => bodyTag + restored)
        console.log(`[slide-repair] slide ${input.slideIndex}: eyebrow dropped by repair — restored`)
      } else if (!repairedEyebrow[2].replace(/<[^>]+>/g, '').trim()) {
        const inner = originalEyebrow[2]
        html = html.replace(EYEBROW_RE, (_m, open: string, _inner: string, close: string) => open + inner + close)
        console.log(`[slide-repair] slide ${input.slideIndex}: eyebrow blanked by repair — restored`)
      }
    }

    return html
  } catch (e) {
    console.warn(`[slide-repair] slide ${input.slideIndex} failed:`, e instanceof Error ? e.message : e)
    return null
  }
}
