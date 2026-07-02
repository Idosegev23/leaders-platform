/**
 * Slide critic — visual QA loop over rendered slide screenshots (spec C5).
 *
 * Slides render to PNG via the existing Playwright path, then Gemini vision
 * answers a BINARY checklist per slide (research: binary/pairwise only, never
 * 1-10 scores; few-shot exemplars in the prompt). A single VLM verdict is not
 * ground truth — fixes are only kept for slides with at least one failed
 * check, and only cssPatch / shrink-text fixes are auto-applied. swap-image /
 * recolor are surfaced via `meta.validation.layout` for the editor.
 *
 * Failure policy: render/model/parse failures degrade to an all-true critique
 * (do no harm) with an 'unchecked: …' note in `issues`; never throws for
 * external failures, never blocks generation.
 */

import { GoogleGenAI, Type } from '@google/genai'
import { renderSlidesToImages } from '@/lib/playwright/pdf'
import type { ModelCallRequest, ModelCaller } from '@/lib/brand/vlm-verify'
import type { StructuredSlide } from '@/lib/gemini/layout-prototypes/types'

// ─── Public types ───────────────────────────────────────

export interface SlideCritique {
  slideIndex: number
  checks: {
    legible: boolean
    noOverlap: boolean
    noOverflow: boolean
    imageRelevant: boolean
    rtlOk: boolean
    hasFocalPoint: boolean
  }
  issues: string[]
  fixes: Array<
    | { role: string; cssPatch: string; reason: string }
    | { action: 'swap-image' | 'shrink-text' | 'recolor'; target: string; reason: string }
  >
}

const CHECK_KEYS = [
  'legible',
  'noOverlap',
  'noOverflow',
  'imageRelevant',
  'rtlOk',
  'hasFocalPoint',
] as const

const AUTO_ACTIONS = ['swap-image', 'shrink-text', 'recolor'] as const

const DEFAULT_BUDGET_MS = 120_000
const CONCURRENCY = 3
const SHRINK_FACTOR = 0.85
const MIN_FONT_PX = 10

// ─── Models (env-first, see src/lib/research-hub/gemini.ts) ──

const criticModel = () =>
  process.env.GEMINI_REASONING_MODEL ?? 'gemini-3.1-pro-preview'

// ─── Gemini client + injectable seams (test) ────────────

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

async function defaultModelCaller(req: ModelCallRequest): Promise<string> {
  const res = await getClient().models.generateContent({
    model: req.model,
    contents: [{ role: 'user', parts: req.parts as never }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: req.responseSchema as never,
      temperature: 0,
    },
  })
  return res.text ?? ''
}

let modelCaller: ModelCaller = defaultModelCaller

/** Test seam: inject a canned caller; pass null to restore the real one. */
export function __setModelCallerForTests(fn: ModelCaller | null): void {
  modelCaller = fn ?? defaultModelCaller
}

/** htmlSlides → base64 PNGs. Injectable so tests never launch Playwright. */
export type SlideRenderer = (htmlSlides: string[]) => Promise<string[]>

let slideRenderer: SlideRenderer = renderSlidesToImages

/** Test seam: inject a canned renderer; pass null to restore the real one. */
export function __setSlideRendererForTests(fn: SlideRenderer | null): void {
  slideRenderer = fn ?? renderSlidesToImages
}

// ─── Response schema ────────────────────────────────────

const CRITIQUE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    checks: {
      type: Type.OBJECT,
      properties: {
        legible: { type: Type.BOOLEAN },
        noOverlap: { type: Type.BOOLEAN },
        noOverflow: { type: Type.BOOLEAN },
        imageRelevant: { type: Type.BOOLEAN },
        rtlOk: { type: Type.BOOLEAN },
        hasFocalPoint: { type: Type.BOOLEAN },
      },
      required: [...CHECK_KEYS],
    },
    issues: { type: Type.ARRAY, items: { type: Type.STRING } },
    fixes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          cssPatch: { type: Type.STRING },
          action: { type: Type.STRING, enum: [...AUTO_ACTIONS] },
          target: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['reason'],
      },
    },
  },
  required: ['checks', 'issues', 'fixes'],
} as Record<string, unknown>

// ─── Prompt ─────────────────────────────────────────────

const CHECKLIST_PROMPT = `You are a meticulous presentation art director doing visual QA on ONE rendered slide (1920x1080 canvas, Hebrew RTL deck).
Evaluate the attached screenshot against this BINARY checklist — true/false only, never scores:
- legible: every piece of text is readable — sufficient contrast against what it actually sits on, not too small, not lost inside a busy image.
- noOverlap: no element collides with another in a way that hurts reading (text over text, text over an unscrimmed busy image area, cards colliding).
- noOverflow: nothing is clipped by the canvas edges; no text cut off mid-word or mid-line.
- imageRelevant: imagery looks intentional, fully loaded, and brand-appropriate (no broken-image icons, no placeholder/generic mismatch). true when the slide has no imagery.
- rtlOk: Hebrew text reads right-to-left with correct alignment; no mixed-direction glitches (punctuation/numbers on the wrong side).
- hasFocalPoint: one clear focal point; the slide is not a uniform wall of equal-weight content.

Rules for issues and fixes:
- Report an issue ONLY for a check you marked false. Be concrete: name the element and what is wrong.
- Propose a fix ONLY when you are confident it resolves a false check. Minimal, surgical changes.
- CSS patch fix: {"role": "<data-role>", "cssPatch": "prop: value; prop: value;", "reason": "..."} — role MUST be one of the data-role names listed below.
- Action fix: {"action": "swap-image" | "shrink-text" | "recolor", "target": "<data-role>", "reason": "..."} — use only when a CSS nudge cannot fix it.
- If every check passes, issues and fixes MUST be empty arrays.`

// Few-shot exemplars (research: exemplars materially improve VLM QA).
const FEW_SHOT_EXEMPLARS = `EXAMPLE 1 — clean slide (60/40 split: product photo right, headline + 3 short bullets left, generous margins):
{"checks":{"legible":true,"noOverlap":true,"noOverflow":true,"imageRelevant":true,"rtlOk":true,"hasFocalPoint":true},"issues":[],"fixes":[]}

EXAMPLE 2 — broken slide (headline collides with the oversized stat numeral; body paragraph runs past the bottom edge):
{"checks":{"legible":true,"noOverlap":false,"noOverflow":false,"imageRelevant":true,"rtlOk":true,"hasFocalPoint":true},"issues":["headline overlaps the stat-0 numeral","body paragraph is clipped at the bottom canvas edge"],"fixes":[{"role":"title","cssPatch":"top: 120px; max-width: 900px;","reason":"move the headline up and constrain its width so it clears stat-0"},{"action":"shrink-text","target":"body","reason":"body overflows the canvas bottom; smaller type fits the frame"}]}`

const ROLE_RE = /data-role="([^"]+)"/g

function extractRoles(html: string): string[] {
  const roles = new Set<string>()
  for (const m of Array.from(html.matchAll(ROLE_RE))) roles.add(m[1])
  return Array.from(roles)
}

function buildPrompt(html: string): string {
  const roles = extractRoles(html)
  return (
    `${CHECKLIST_PROMPT}\n\n${FEW_SHOT_EXEMPLARS}\n\n` +
    `Elements on this slide (valid data-role names): ${roles.length ? roles.join(', ') : '(none found)'}\n\n` +
    'Return JSON only: {"checks": {...}, "issues": string[], "fixes": [...]}.'
  )
}

// ─── Strict parsing (schema-valid JSON ≠ correct content) ──

function parseJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  const candidates = [fenced?.[1], text]
  for (const candidate of candidates) {
    if (!candidate) continue
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      const s = candidate.indexOf('{')
      const e = candidate.lastIndexOf('}')
      if (s !== -1 && e > s) {
        try {
          const parsed = JSON.parse(candidate.slice(s, e + 1))
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>
          }
        } catch {
          /* fall through */
        }
      }
    }
  }
  return null
}

function normalizeFix(f: unknown): SlideCritique['fixes'][number] | null {
  if (!f || typeof f !== 'object') return null
  const o = f as Record<string, unknown>
  const reason = typeof o.reason === 'string' ? o.reason.trim() : ''
  if (!reason) return null
  const action = typeof o.action === 'string' ? o.action.trim() : ''
  if (action) {
    if (!(AUTO_ACTIONS as readonly string[]).includes(action)) return null
    const target = typeof o.target === 'string' ? o.target.trim() : ''
    if (!target) return null
    return { action: action as (typeof AUTO_ACTIONS)[number], target, reason }
  }
  const role = typeof o.role === 'string' ? o.role.trim() : ''
  const cssPatch = typeof o.cssPatch === 'string' ? o.cssPatch.trim() : ''
  // A cssPatch without at least one prop:value pair is not actionable.
  if (!role || !cssPatch.includes(':')) return null
  return { role, cssPatch, reason }
}

function parseCritique(raw: string, slideIndex: number): SlideCritique | null {
  const obj = parseJsonObject(raw)
  if (!obj || typeof obj.checks !== 'object' || obj.checks === null) return null
  const c = obj.checks as Record<string, unknown>
  for (const k of CHECK_KEYS) if (typeof c[k] !== 'boolean') return null
  const checks = Object.fromEntries(
    CHECK_KEYS.map((k) => [k, c[k] as boolean]),
  ) as SlideCritique['checks']

  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())
    : []

  // Only act on fail verdicts with a concrete fix — a fix with all-true
  // checks means the model contradicted itself; drop it.
  const anyFail = CHECK_KEYS.some((k) => !checks[k])
  const fixes: SlideCritique['fixes'] = []
  if (anyFail && Array.isArray(obj.fixes)) {
    for (const f of obj.fixes) {
      const fix = normalizeFix(f)
      if (fix) fixes.push(fix)
    }
  }
  return { slideIndex, checks, issues, fixes }
}

/** All-true critique — used for unchecked/invalid slides (do no harm). */
function uncheckedCritique(slideIndex: number, note: string): SlideCritique {
  return {
    slideIndex,
    checks: {
      legible: true,
      noOverlap: true,
      noOverflow: true,
      imageRelevant: true,
      rtlOk: true,
      hasFocalPoint: true,
    },
    issues: [note],
    fixes: [],
  }
}

// ─── critiqueSlides ─────────────────────────────────────

async function critiqueOne(slideIndex: number, pngBase64: string, html: string): Promise<SlideCritique> {
  let raw: string
  try {
    raw = await modelCaller({
      model: criticModel(),
      parts: [
        { text: buildPrompt(html) },
        { inlineData: { mimeType: 'image/png', data: pngBase64 } },
      ],
      responseSchema: CRITIQUE_SCHEMA,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return uncheckedCritique(slideIndex, `unchecked: critic unavailable: ${msg}`)
  }
  return parseCritique(raw, slideIndex) ?? uncheckedCritique(slideIndex, 'unchecked: invalid critic output')
}

/**
 * Render slides → PNG → per-slide binary checklist via Gemini vision.
 * Returns one critique per input slide; slides not reached (maxSlides limit,
 * budget exhausted, render failure) come back all-true with an 'unchecked: …'
 * note in `issues`.
 */
export async function critiqueSlides(
  htmlSlides: string[],
  opts?: { maxSlides?: number; budgetMs?: number },
): Promise<SlideCritique[]> {
  const budgetMs = opts?.budgetMs ?? DEFAULT_BUDGET_MS
  const deadline = Date.now() + budgetMs
  const maxSlides = Math.max(0, Math.min(opts?.maxSlides ?? htmlSlides.length, htmlSlides.length))

  const critiques: SlideCritique[] = htmlSlides.map((_, i) =>
    uncheckedCritique(i, i < maxSlides ? 'unchecked: budget exhausted' : 'unchecked: maxSlides limit'),
  )
  if (maxSlides === 0 || Date.now() >= deadline) return critiques

  // Batch render (single browser instance); render time counts toward budget
  // and is DEADLINE-GATED — Playwright can stall for minutes on slow assets,
  // and an overshoot here must cost only the critique, never the caller's
  // remaining wall-clock (the deck is already persisted by the route).
  let images: string[]
  try {
    const renderBudget = Math.max(5_000, deadline - Date.now() - 10_000) // keep ≥10s for critiques
    images = await Promise.race([
      slideRenderer(htmlSlides.slice(0, maxSlides)),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`render budget exhausted (${Math.round(renderBudget / 1000)}s)`)), renderBudget),
      ),
    ])
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    for (let i = 0; i < maxSlides; i++) {
      critiques[i] = uncheckedCritique(i, `unchecked: render failed: ${msg}`)
    }
    return critiques
  }

  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++
      if (i >= maxSlides) return
      const remaining = deadline - Date.now()
      if (remaining <= 0) return // remaining stay marked unchecked
      const png = images[i]
      if (!png) {
        critiques[i] = uncheckedCritique(i, 'unchecked: no rendered image')
        continue
      }
      // Race each critique against the remaining budget — an in-flight Gemini
      // call (600s client timeout) must not hold the loop past the deadline.
      critiques[i] = await Promise.race([
        critiqueOne(i, png, htmlSlides[i]),
        new Promise<SlideCritique>((resolve) =>
          setTimeout(() => resolve(uncheckedCritique(i, 'unchecked: budget exhausted')), remaining),
        ),
      ])
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, maxSlides) }, worker))
  return critiques
}

// ─── applyAutoFixes ─────────────────────────────────────

/**
 * Merge editor-style CSS declaration strings; patch wins on conflicts.
 * Naive ';' split — fine for editor styles, not for url()s with ';' inside.
 */
function mergeCss(base: string | undefined, patch: string): string {
  const decls = new Map<string, string>()
  for (const part of `${base ?? ''};${patch}`.split(';')) {
    const i = part.indexOf(':')
    if (i === -1) continue
    const prop = part.slice(0, i).trim().toLowerCase()
    const value = part.slice(i + 1).trim()
    if (prop && value) decls.set(prop, value)
  }
  return Array.from(decls, ([p, v]) => `${p}: ${v};`).join(' ')
}

const FONT_SIZE_RE = /font-size:\s*([\d.]+)px/i

/**
 * Conservative auto-fix: applies only cssPatch fixes (merged into
 * elementStyles) and 'shrink-text' (existing px font-size × 0.85).
 * swap-image / recolor are NEVER applied — they're surfaced via
 * `meta.validation.layout` for the editor, together with residual issues.
 * Fixes are ignored entirely unless at least one check failed.
 * Input slide is not mutated.
 */
export function applyAutoFixes(
  slide: StructuredSlide,
  critique: SlideCritique,
): { slide: typeof slide; applied: string[] } {
  const applied: string[] = []
  const manual: string[] = []
  const anyFail = CHECK_KEYS.some((k) => !critique.checks[k])

  const out: StructuredSlide = { ...slide }
  const styles: Record<string, string> = { ...(slide.elementStyles ?? {}) }
  let stylesTouched = false

  if (anyFail) {
    for (const fix of critique.fixes) {
      if ('cssPatch' in fix) {
        styles[fix.role] = mergeCss(styles[fix.role], fix.cssPatch)
        stylesTouched = true
        applied.push(`${fix.role}: css patch (${fix.reason})`)
      } else if (fix.action === 'shrink-text') {
        const existing = styles[fix.target]
        const m = existing?.match(FONT_SIZE_RE)
        if (m) {
          const cur = parseFloat(m[1])
          const nextSize = Math.max(MIN_FONT_PX, Math.round(cur * SHRINK_FACTOR))
          styles[fix.target] = mergeCss(existing, `font-size: ${nextSize}px`)
          stylesTouched = true
          applied.push(`${fix.target}: font-size ${cur}px → ${nextSize}px (shrink-text: ${fix.reason})`)
        } else {
          // No explicit px size to shrink — renderer default unknown, don't guess.
          manual.push(`shrink-text → ${fix.target}: ${fix.reason} (no explicit px font-size)`)
        }
      } else {
        manual.push(`${fix.action} → ${fix.target}: ${fix.reason}`)
      }
    }
  }

  if (stylesTouched || slide.elementStyles) out.elementStyles = styles

  // Slides that were never actually checked keep whatever meta they had.
  const wasChecked = anyFail || !critique.issues.some((s) => s.startsWith('unchecked:'))
  if (wasChecked) {
    const status: 'ok' | 'issues' = anyFail || manual.length > 0 ? 'issues' : 'ok'
    const issues = [...critique.issues, ...manual]
    out.meta = {
      ...slide.meta,
      validation: {
        ...slide.meta?.validation,
        layout: {
          status,
          ...(status === 'issues' && issues.length ? { issues } : {}),
          checkedAt: new Date().toISOString(),
        },
      },
    }
  }

  return { slide: out, applied }
}
