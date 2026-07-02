/**
 * Brand-faithful scene generator (art-director engine, C3).
 *
 * Generates premium lifestyle/editorial scenes with Nano Banana Pro
 * (Gemini 3 Pro Image), seeding the generation with REAL product reference
 * photos so the brand's actual product appears in the scene — never a
 * generic AI substitute.
 *
 * Hard constraints (verified research, 2026-07-02):
 * - Model id `gemini-3-pro-image-preview` (docs-confirmed current id; the
 *   API accepts up to 14 reference images, 6 high-fidelity objects → we cap
 *   product refs at 6).
 * - Hebrew is NOT in the image-gen best-performance language list → scenes
 *   are strictly TEXT-FREE; all copy renders in the HTML layer.
 *
 * Failure policy: any API/fetch/upload error returns null (caller falls back
 * to real product photos). A failed fidelity verification retries ONCE with
 * strengthened wording, then returns the asset flagged 'unverified' — it
 * never blocks generation.
 */

import { GoogleGenAI } from '@google/genai'
import { createSupabaseService } from '@/lib/research-hub/service'
import type { SceneImageAsset } from '@/lib/brand/types'
// Relative (not '@/') so tsx scripts share this module instance with their
// relative import — the '@/' alias resolves to a second copy under tsx and
// the test seam injection would miss it.
import { vlmVerify, readBodyCapped } from './vlm-verify'

// ─── Types ──────────────────────────────────────────────

export interface SceneRequest {
  brandName: string
  forSlideType: string
  artDirection: string
  designSystem?: { colors?: Record<string, string> }
  productRefs: string[]
  documentId: string
}

type ContentPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }

export interface ImageGenRequest {
  model: string
  parts: ContentPart[]
  aspectRatio: '16:9'
  imageSize: '1K' | '2K' | '4K'
}

export type ImageGenerator = (
  req: ImageGenRequest,
) => Promise<{ base64: string; mimeType: string } | null>

/** Uploads bytes to storage; resolves the public URL or null on failure. */
export type SceneUploader = (
  path: string,
  body: Buffer,
  contentType: string,
) => Promise<string | null>

interface FetchedRef {
  base64: string
  mimeType: string
  sourceUrl: string
}

// ─── Constants ──────────────────────────────────────────

// Docs-confirmed current id (ai.google.dev/gemini-api/docs/image-generation).
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image-preview'
// Nano Banana Pro: max 6 high-fidelity object references.
const MAX_PRODUCT_REFS = 6
const ASSETS_BUCKET = 'assets'
const REF_FETCH_TIMEOUT_MS = 15_000
const MAX_REF_BYTES = 10 * 1024 * 1024

const imageModel = () => process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL

// ─── Gemini client + injectable seams (no live testing from dev sandbox) ──

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

async function defaultImageGenerator(
  req: ImageGenRequest,
): Promise<{ base64: string; mimeType: string } | null> {
  const response = await getClient().models.generateContent({
    model: req.model,
    contents: [{ role: 'user', parts: req.parts as never }],
    config: {
      responseModalities: ['image', 'text'],
      imageConfig: { aspectRatio: req.aspectRatio, imageSize: req.imageSize },
    } as never,
  })
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        }
      }
    }
  }
  return null
}

async function defaultUploader(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<string | null> {
  // Public 'assets' bucket, same as generate-visual-assets: upsert + public URL.
  try {
    const sb = createSupabaseService()
    const { error } = await sb.storage
      .from(ASSETS_BUCKET)
      .upload(path, body, { contentType, upsert: true })
    if (error) {
      console.error(`[SceneGen][Upload] Failed ${path}:`, error.message)
      return null
    }
    const { data } = sb.storage.from(ASSETS_BUCKET).getPublicUrl(path)
    return data?.publicUrl || null
  } catch (err) {
    console.error(`[SceneGen][Upload] Error ${path}:`, err instanceof Error ? err.message : err)
    return null
  }
}

let imageGenerator: ImageGenerator = defaultImageGenerator
let sceneUploader: SceneUploader = defaultUploader

/** Test seam: inject a canned image generator; pass null to restore. */
export function __setImageGeneratorForTests(fn: ImageGenerator | null): void {
  imageGenerator = fn ?? defaultImageGenerator
}

/** Test seam: inject a canned uploader; pass null to restore. */
export function __setSceneUploaderForTests(fn: SceneUploader | null): void {
  sceneUploader = fn ?? defaultUploader
}

// ─── Reference image fetching ───────────────────────────

async function fetchRef(url: string): Promise<FetchedRef | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REF_FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 LeadersBot/1.0' },
    })
    if (!res.ok) return null
    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg'
    // Gemini can't ingest SVG or non-image payloads (e.g. HTML error pages) —
    // reject from headers before downloading the body.
    if (!mimeType.startsWith('image/') || mimeType.includes('svg')) return null
    const buf = await readBodyCapped(res, MAX_REF_BYTES)
    if (!buf || buf.byteLength === 0) return null
    return { base64: buf.toString('base64'), mimeType, sourceUrl: url }
  } catch {
    return null
  }
}

/** Fetches refs in order, stopping once MAX_PRODUCT_REFS succeeded. */
async function collectRefs(urls: string[]): Promise<FetchedRef[]> {
  const refs: FetchedRef[] = []
  for (const url of urls) {
    if (refs.length >= MAX_PRODUCT_REFS) break
    const ref = await fetchRef(url)
    if (ref) refs.push(ref)
  }
  return refs
}

// ─── Prompt construction ────────────────────────────────

const NO_TEXT_CLAUSE =
  'Absolutely no text, no letters, no numbers, no logos overlaid, no watermarks, ' +
  'no captions anywhere in the image — the only branding allowed is what is ' +
  'natively printed on the product packaging itself.'

const STRENGTHENED_FIDELITY_CLAUSE =
  'CRITICAL FIDELITY REQUIREMENT: the product must be an EXACT visual replica of ' +
  'the product in the reference images — identical label artwork and typography, ' +
  'identical packaging shape, cap/closure, proportions, materials and colorway. ' +
  'Do not redesign, restyle, simplify or substitute the product in any way. ' +
  'Any deviation from the reference product is a failure.'

function paletteHint(designSystem?: SceneRequest['designSystem']): string {
  const colors = designSystem?.colors
  if (!colors) return ''
  const entries = Object.entries(colors)
    .filter(([, v]) => typeof v === 'string' && v.trim())
    .slice(0, 6)
  if (!entries.length) return ''
  const list = entries.map(([k, v]) => `${k}: ${v}`).join(', ')
  return `Brand palette hints — echo these tones in the environment, props and lighting: ${list}.`
}

function buildScenePrompt(req: SceneRequest, strengthened: boolean): string {
  const lines = [
    `Premium lifestyle / editorial photography scene for the "${req.forSlideType}" slide ` +
      `of a brand presentation for ${req.brandName}.`,
    'The scene features the EXACT product shown in the attached reference images as its hero — ' +
      'faithfully preserve the product label, packaging shape, proportions and colors. ' +
      'Never redesign or substitute the product.',
    `Art direction: ${req.artDirection}.`,
    paletteHint(req.designSystem),
    'Photorealistic, magazine-quality composition and lighting, cinematic depth, ' +
      '16:9 full-bleed framing for a 1920x1080 presentation slide.',
    NO_TEXT_CLAUSE,
    strengthened ? STRENGTHENED_FIDELITY_CLAUSE : '',
  ]
  return lines.filter(Boolean).join('\n')
}

// ─── Storage path ───────────────────────────────────────

// Supabase storage keys must be ASCII-only (same rule as generate-visual-assets).
function scenePath(req: SceneRequest): string {
  const brandPrefix = req.brandName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20) || 'brand'
  const slidePrefix =
    req.forSlideType.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'scene'
  const rand = Math.random().toString(36).slice(2, 10)
  return `proposals/${brandPrefix}/scenes/${slidePrefix}-${rand}.png`
}

// ─── Public API ─────────────────────────────────────────

/**
 * Generates one brand-faithful scene for a slide type.
 * Returns null on any API/fetch/upload failure — callers fall back to real
 * product photos. A failed fidelity check retries once, then flags
 * 'unverified' (never blocks).
 */
export async function generateBrandScene(req: SceneRequest): Promise<SceneImageAsset | null> {
  const requestId = `scene-${req.documentId?.slice(0, 8) || 'nodoc'}-${Date.now()}`

  if (!req.brandName?.trim() || !req.forSlideType?.trim()) {
    console.warn(`[SceneGen][${requestId}] Missing brandName/forSlideType — skipping`)
    return null
  }
  if (!req.productRefs?.length) {
    console.log(`[SceneGen][${requestId}] No product refs — skipping (caller falls back to photos)`)
    return null
  }

  const refs = await collectRefs(req.productRefs)
  if (!refs.length) {
    console.warn(`[SceneGen][${requestId}] All ${req.productRefs.length} product refs unfetchable — skipping`)
    return null
  }

  const model = imageModel()
  console.log(
    `[SceneGen][${requestId}] Generating "${req.forSlideType}" scene for ${req.brandName} ` +
      `(model=${model}, refs=${refs.length}/${req.productRefs.length})`,
  )

  // Attempt 0 = base prompt; attempt 1 = strengthened faithfulness retry.
  let lastAsset: SceneImageAsset | null = null

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildScenePrompt(req, attempt > 0)
    const parts: ContentPart[] = []
    refs.forEach((ref, i) => {
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } })
      parts.push({
        text: `[Reference ${i + 1}: real ${req.brandName} product photo — the exact product to depict]`,
      })
    })
    parts.push({ text: prompt })

    let image: { base64: string; mimeType: string } | null = null
    try {
      image = await imageGenerator({ model, parts, aspectRatio: '16:9', imageSize: '2K' })
    } catch (err) {
      console.error(
        `[SceneGen][${requestId}] Generation attempt ${attempt + 1} threw:`,
        err instanceof Error ? err.message : err,
      )
    }
    if (!image?.base64) {
      // Gen failed: return the previous attempt's flagged asset if we have one.
      console.warn(`[SceneGen][${requestId}] No image on attempt ${attempt + 1}`)
      return lastAsset
    }

    const path = scenePath(req)
    const mimeType = image.mimeType || 'image/png'
    const url = await sceneUploader(path, Buffer.from(image.base64, 'base64'), mimeType)
    if (!url) {
      console.warn(`[SceneGen][${requestId}] Upload failed on attempt ${attempt + 1}`)
      return lastAsset
    }

    const verdict = await vlmVerify({
      imageBase64: image.base64,
      mimeType,
      identifyPrompt:
        'Describe the product shown in this lifestyle scene — its packaging shape, label and ' +
        `colors. Is it plausibly the same product as the brand ${req.brandName}?`,
      expectation:
        `A real ${req.brandName} product — the same product shown in the brand's reference ` +
        'photos, with matching packaging, label and colors',
    })

    const asset: SceneImageAsset = {
      url,
      status: verdict.verdict === 'pass' ? 'verified' : 'unverified',
      reasoning: verdict.reasoning,
      checkedAt: new Date().toISOString(),
      forSlideType: req.forSlideType,
      prompt,
      referenceUrls: refs.map((r) => r.sourceUrl),
    }

    if (verdict.verdict === 'pass') {
      console.log(`[SceneGen][${requestId}] ✅ Verified on attempt ${attempt + 1}: ${url}`)
      return asset
    }

    // vlm-verify convention: these prefixes mean the CHECK failed, not the
    // image — regenerating won't help, flag unverified immediately.
    const transient =
      verdict.reasoning.startsWith('verification unavailable') ||
      verdict.reasoning.startsWith('image fetch failed')
    if (transient) {
      console.warn(`[SceneGen][${requestId}] Verification unavailable — flagging unverified: ${verdict.reasoning}`)
      return asset
    }

    console.warn(
      `[SceneGen][${requestId}] Fidelity check failed on attempt ${attempt + 1}: ${verdict.reasoning}`,
    )
    lastAsset = asset
  }

  // Both attempts failed fidelity → return the last one, flagged for the editor.
  return lastAsset
}
