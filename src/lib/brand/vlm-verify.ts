/**
 * Two-phase VLM verification helper (art-director engine, C0).
 *
 * Phase 1 — vision model gets the image + an OPEN identification question.
 * Phase 2 — a text judge gets Phase-1's answer + the expectation and returns
 * a BINARY verdict. Never scores (research: binary/pairwise only).
 *
 * Failure policy: a bad image, an unreachable API, or malformed model output
 * always resolves to a 'fail'/'no' verdict with reasoning — callers flag and
 * continue, generation is never blocked. Throwing is reserved for programmer
 * errors (missing image input / empty prompts).
 *
 * Reasoning prefix conventions callers can rely on:
 *   'image fetch failed'       — transient, treat as unverified (not memoized)
 *   'verification unavailable' — model/API error, treat as unverified
 *   'invalid model output'     — schema-valid JSON but bad content values
 */

import { GoogleGenAI, Type } from '@google/genai'

// ─── Types ──────────────────────────────────────────────

export interface VlmVerifyInput {
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  /** Open identification question for the vision model (Phase 1). */
  identifyPrompt: string
  /** What we expect the image to be (brand name, domain, product…). */
  expectation: string
  /** Optional override for the Phase-2 judge instruction. */
  judgePrompt?: string
}

export interface VlmVerdict {
  verdict: 'pass' | 'fail'
  /** Phase-1 free-text identification of what the image actually shows. */
  identified: string
  reasoning: string
}

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

export interface ModelCallRequest {
  model: string
  parts: ContentPart[]
  responseSchema: Record<string, unknown>
}

export type ModelCaller = (req: ModelCallRequest) => Promise<string>

// ─── Models ─────────────────────────────────────────────

// Env-first like the rest of the repo (see src/lib/research-hub/gemini.ts).
const identifyModel = () =>
  process.env.GEMINI_REASONING_MODEL ?? 'gemini-3.1-pro-preview'
const judgeModel = () =>
  process.env.GEMINI_FAST_MODEL ?? 'gemini-3.1-flash-lite-preview'

// ─── Gemini client + injectable caller (test seam) ──────

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

// ─── Memoization (per-process; avoids re-billing within a request) ──

const MAX_CACHE_ENTRIES = 200
const cache = new Map<string, unknown>()

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

export function clearVlmVerifyCache(): void {
  cache.clear()
}

/** Cheap stable key for base64 payloads (no node:crypto — edge-safe). */
function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function imageKey(input: { imageUrl?: string; imageBase64?: string }): string {
  return input.imageUrl ?? `b64:${hashString(input.imageBase64 ?? '')}`
}

// ─── Image resolution ───────────────────────────────────

const FETCH_TIMEOUT_MS = 10_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type ResolvedImage =
  | { ok: true; base64: string; mimeType: string }
  | { ok: false; reason: string }

async function resolveImage(input: {
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
}): Promise<ResolvedImage> {
  if (input.imageBase64) {
    return { ok: true, base64: input.imageBase64, mimeType: input.mimeType || 'image/png' }
  }
  const url = input.imageUrl
  if (!url) {
    // Programmer error — no image provided at all.
    throw new TypeError('vlm-verify: either imageUrl or imageBase64 is required')
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return { ok: false, reason: `image fetch failed: HTTP ${res.status}` }
    const mimeType =
      input.mimeType || res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
    // Gemini vision can't ingest SVG or non-image payloads (e.g. HTML error
    // pages) — reject from headers BEFORE downloading the body.
    if (!mimeType.startsWith('image/') || mimeType.includes('svg')) {
      return { ok: false, reason: `image fetch failed: unsupported content-type '${mimeType}'` }
    }
    const declared = Number(res.headers.get('content-length') || 0)
    if (declared > MAX_IMAGE_BYTES) {
      return { ok: false, reason: `image fetch failed: too large (${declared} bytes)` }
    }
    const buf = await readBodyCapped(res, MAX_IMAGE_BYTES)
    if (!buf) return { ok: false, reason: `image fetch failed: too large (>${MAX_IMAGE_BYTES} bytes)` }
    if (buf.byteLength === 0) return { ok: false, reason: 'image fetch failed: empty body' }
    return { ok: true, base64: buf.toString('base64'), mimeType }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `image fetch failed: ${msg}` }
  }
}

/**
 * Read a response body with a hard byte cap enforced DURING download —
 * a chunked/missing content-length response can't balloon memory past the cap.
 * Returns null when the cap is exceeded.
 */
export async function readBodyCapped(res: Response, capBytes: number): Promise<Buffer | null> {
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.byteLength > capBytes ? null : buf
  }
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > capBytes) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

// ─── JSON parsing + content-level validation ────────────
// Schema-valid JSON is NOT enough (research: 15-25pp gap) — enum values are
// re-asserted after parse.

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

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

// ─── Response schemas ───────────────────────────────────

const IDENTIFY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    identified: { type: Type.STRING },
  },
  required: ['identified'],
} as Record<string, unknown>

const JUDGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ['pass', 'fail'] },
    reasoning: { type: Type.STRING },
  },
  required: ['verdict', 'reasoning'],
} as Record<string, unknown>

const BINARY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, enum: ['yes', 'no'] },
    reasoning: { type: Type.STRING },
  },
  required: ['verdict', 'reasoning'],
} as Record<string, unknown>

// ─── Prompts ────────────────────────────────────────────

const IDENTIFY_SUFFIX =
  '\n\nAnswer factually based only on what is visible in the image. ' +
  'Return JSON: {"identified": string} — a concise, specific identification/description.'

const DEFAULT_JUDGE_INSTRUCTION =
  'You are a strict verification judge. A vision model analyzed an image; ' +
  'you get its answer and an expectation. Verdict "pass" ONLY if the answer ' +
  'clearly and specifically confirms the expectation. Verdict "fail" on any ' +
  'mismatch, ambiguity, or generic/unrelated content, or if the answer states ' +
  'the image itself IS a favicon, placeholder, low-resolution or broken image. ' +
  'Judge the meaning, not keywords: a negated mention such as "a real logo, ' +
  'not a favicon" supports a pass, not a fail.'

function buildJudgePrompt(identified: string, expectation: string, judgePrompt?: string): string {
  return (
    `${judgePrompt?.trim() || DEFAULT_JUDGE_INSTRUCTION}\n\n` +
    `Vision model's answer about the image:\n"""\n${identified}\n"""\n\n` +
    `Expectation to verify:\n"""\n${expectation}\n"""\n\n` +
    'Return JSON: {"verdict": "pass" | "fail", "reasoning": string (one short sentence)}.'
  )
}

// ─── Public API ─────────────────────────────────────────

/**
 * Two-phase verification: vision identify → text judge vs. expectation.
 * Never throws for bad images or model failures — see failure policy above.
 */
export async function vlmVerify(input: VlmVerifyInput): Promise<VlmVerdict> {
  const identifyPrompt = input.identifyPrompt?.trim()
  const expectation = input.expectation?.trim()
  if (!identifyPrompt) throw new TypeError('vlm-verify: identifyPrompt is required')
  if (!expectation) throw new TypeError('vlm-verify: expectation is required')
  if (!input.imageUrl && !input.imageBase64) {
    throw new TypeError('vlm-verify: either imageUrl or imageBase64 is required')
  }

  const key = `verify:${imageKey(input)}|${identifyPrompt}|${expectation}|${input.judgePrompt ?? ''}`
  const cached = cache.get(key)
  if (cached) return cached as VlmVerdict

  const image = await resolveImage(input)
  if (!image.ok) {
    // Transient — not memoized so a later retry can re-fetch.
    return { verdict: 'fail', identified: '', reasoning: image.reason }
  }

  let identified: string
  try {
    const rawIdentify = await modelCaller({
      model: identifyModel(),
      parts: [
        { text: identifyPrompt + IDENTIFY_SUFFIX },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
      ],
      responseSchema: IDENTIFY_SCHEMA,
    })
    identified = asTrimmedString(parseJsonObject(rawIdentify)?.identified)
    if (!identified) {
      return { verdict: 'fail', identified: '', reasoning: 'invalid model output (identify phase)' }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { verdict: 'fail', identified: '', reasoning: `verification unavailable: ${msg}` }
  }

  let verdict: VlmVerdict
  try {
    const rawJudge = await modelCaller({
      model: judgeModel(),
      parts: [{ text: buildJudgePrompt(identified, expectation, input.judgePrompt) }],
      responseSchema: JUDGE_SCHEMA,
    })
    const parsed = parseJsonObject(rawJudge)
    const v = parsed?.verdict
    if (v !== 'pass' && v !== 'fail') {
      return { verdict: 'fail', identified, reasoning: 'invalid model output (judge phase)' }
    }
    verdict = { verdict: v, identified, reasoning: asTrimmedString(parsed?.reasoning) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { verdict: 'fail', identified, reasoning: `verification unavailable: ${msg}` }
  }

  cacheSet(key, verdict)
  return verdict
}

/**
 * Single-phase binary check for simple questions ("does this image contain
 * visible text?"). Same failure policy as vlmVerify.
 */
export async function vlmBinaryCheck(input: {
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  question: string
}): Promise<{ verdict: 'yes' | 'no'; reasoning: string }> {
  const question = input.question?.trim()
  if (!question) throw new TypeError('vlm-verify: question is required')
  if (!input.imageUrl && !input.imageBase64) {
    throw new TypeError('vlm-verify: either imageUrl or imageBase64 is required')
  }

  const key = `binary:${imageKey(input)}|${question}`
  const cached = cache.get(key)
  if (cached) return cached as { verdict: 'yes' | 'no'; reasoning: string }

  const image = await resolveImage(input)
  if (!image.ok) {
    return { verdict: 'no', reasoning: image.reason }
  }

  try {
    const raw = await modelCaller({
      model: identifyModel(),
      parts: [
        {
          text:
            `${question}\n\nAnswer based only on what is visible in the image. ` +
            'Return JSON: {"verdict": "yes" | "no", "reasoning": string (one short sentence)}.',
        },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
      ],
      responseSchema: BINARY_SCHEMA,
    })
    const parsed = parseJsonObject(raw)
    const v = parsed?.verdict
    if (v === 'yes' || v === 'no') {
      const result: { verdict: 'yes' | 'no'; reasoning: string } = {
        verdict: v,
        reasoning: asTrimmedString(parsed?.reasoning),
      }
      cacheSet(key, result)
      return result
    }
    return { verdict: 'no', reasoning: 'invalid model output' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { verdict: 'no', reasoning: `verification unavailable: ${msg}` }
  }
}
