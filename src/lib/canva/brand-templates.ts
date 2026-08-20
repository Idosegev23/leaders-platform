// src/lib/canva/brand-templates.ts
import { getValidAccessToken } from './oauth'

/**
 * Canva Connect — Brand Templates + Autofill (Phase B).
 *
 * Endpoints (verbatim, canva.dev Connect API reference):
 *   GET  https://api.canva.com/rest/v1/brand-templates?dataset=non_empty
 *   GET  https://api.canva.com/rest/v1/brand-templates/{id}/dataset
 *   POST https://api.canva.com/rest/v1/brand-templates            { design_id }
 *   POST https://api.canva.com/rest/v1/autofills                  { type, brand_template_id, title?, data }
 *   GET  https://api.canva.com/rest/v1/autofills/{jobId}
 *
 * Scopes: brandtemplate:meta:read / brandtemplate:content:read /
 * brandtemplate:content:write / design:content:write (autofill job).
 */

const BASE = 'https://api.canva.com/rest/v1'
const POLL_INTERVAL_MS = 2000
const MAX_POLLS = 45 // ~90s ceiling

async function authed(path: string, init?: RequestInit): Promise<Response> {
  const token = await getValidAccessToken()
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

async function orThrow<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Canva ${what} failed (${res.status}): ${body.slice(0, 400)}`)
  }
  return (await res.json()) as T
}

// ── Brand templates ───────────────────────────────────────────────

export interface BrandTemplateSummary {
  id: string
  title: string
  view_url: string
  create_url: string
  thumbnail?: { url: string; width: number; height: number } | null
}

export async function listBrandTemplates(opts?: {
  query?: string
  /** 'non_empty' → only autofill-capable templates */
  dataset?: 'any' | 'non_empty'
}): Promise<BrandTemplateSummary[]> {
  const params = new URLSearchParams()
  if (opts?.query) params.set('query', opts.query)
  if (opts?.dataset) params.set('dataset', opts.dataset)
  const qs = params.toString()
  const json = await orThrow<{ items: BrandTemplateSummary[] }>(
    await authed(`/brand-templates${qs ? `?${qs}` : ''}`),
    'list brand templates',
  )
  return json.items ?? []
}

export type DatasetFieldType = 'text' | 'image' | 'chart'

/** { field_name: { type } } — empty object = template not autofill-capable */
export async function getBrandTemplateDataset(
  brandTemplateId: string,
): Promise<Record<string, { type: DatasetFieldType }>> {
  const json = await orThrow<{ dataset?: Record<string, { type: DatasetFieldType }> }>(
    await authed(`/brand-templates/${brandTemplateId}/dataset`),
    'get dataset',
  )
  return json.dataset ?? {}
}

/** Publish a (tagged) design as a brand template; updates in place if the
 *  design is a draft of an existing template. */
export async function publishBrandTemplate(designId: string): Promise<BrandTemplateSummary> {
  const json = await orThrow<{ brand_template: BrandTemplateSummary }>(
    await authed('/brand-templates', {
      method: 'POST',
      body: JSON.stringify({ design_id: designId }),
    }),
    'publish brand template',
  )
  return json.brand_template
}

// ── Autofill ──────────────────────────────────────────────────────

export type AutofillFieldValue =
  | { type: 'text'; text: string }
  | { type: 'image'; asset_id: string }
  | { type: 'chart'; chart_data: Record<string, unknown> }

export interface AutofillResult {
  designId: string
  editUrl: string
  viewUrl: string
  title?: string
}

interface AutofillJobResponse {
  job: {
    id: string
    status: 'in_progress' | 'success' | 'failed'
    result?: {
      type: string
      design?: { id: string; title?: string; url?: string; urls?: { edit_url?: string; view_url?: string } }
    }
    error?: { code?: string; message?: string }
  }
}

/** Create an autofill job from a brand template and wait for the design. */
export async function autofillFromBrandTemplate(opts: {
  brandTemplateId: string
  title?: string
  data: Record<string, AutofillFieldValue>
}): Promise<AutofillResult> {
  const created = await orThrow<AutofillJobResponse>(
    await authed('/autofills', {
      method: 'POST',
      body: JSON.stringify({
        type: 'create_from_brand_template',
        brand_template_id: opts.brandTemplateId,
        ...(opts.title ? { title: opts.title } : {}),
        data: opts.data,
      }),
    }),
    'create autofill job',
  )

  let job = created.job
  for (let i = 0; i < MAX_POLLS && job.status === 'in_progress'; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    const polled = await orThrow<AutofillJobResponse>(
      await authed(`/autofills/${job.id}`),
      'poll autofill job',
    )
    job = polled.job
  }

  if (job.status !== 'success' || !job.result?.design) {
    throw new Error(
      `Autofill job ${job.id} ${job.status}: ${job.error?.message ?? 'no design returned'}`,
    )
  }

  const d = job.result.design
  return {
    designId: d.id,
    editUrl: d.urls?.edit_url ?? d.url ?? `https://www.canva.com/design/${d.id}/edit`,
    viewUrl: d.urls?.view_url ?? d.url ?? '',
    title: d.title,
  }
}

/** נוחות: ממיר מפת מחרוזות פשוטה לשדות text של Autofill */
export function textData(fields: Record<string, string>): Record<string, AutofillFieldValue> {
  const out: Record<string, AutofillFieldValue> = {}
  for (const [k, v] of Object.entries(fields)) out[k] = { type: 'text', text: v }
  return out
}

// ── Asset upload (for image autofill fields) ──────────────────────

interface AssetUploadJobResponse {
  job: {
    id: string
    status: 'in_progress' | 'success' | 'failed'
    asset?: { id: string }
    error?: { code?: string; message?: string }
  }
}

/**
 * מוריד תמונה מ-URL (למשל תמונת פרופיל של משפיענית שאוחסנה ב-Supabase)
 * ומעלה אותה כ-asset לקנבה. מחזיר asset_id לשימוש בשדה image של Autofill.
 * Scope: asset:write.
 */
export async function uploadAssetFromUrl(url: string, name = 'leaders-asset'): Promise<string> {
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`asset source fetch failed (${imgRes.status}): ${url.slice(0, 120)}`)
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  const token = await getValidAccessToken()
  const created = await orThrow<AssetUploadJobResponse>(
    await fetch(`${BASE}/asset-uploads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
        'Asset-Upload-Metadata': JSON.stringify({
          name_base64: Buffer.from(name.slice(0, 50)).toString('base64'),
        }),
      },
      body: new Uint8Array(buffer),
    }),
    'create asset upload',
  )

  let job = created.job
  for (let i = 0; i < 30 && job.status === 'in_progress'; i++) {
    await new Promise((r) => setTimeout(r, 1500))
    const polled = await orThrow<AssetUploadJobResponse>(
      await authed(`/asset-uploads/${job.id}`),
      'poll asset upload',
    )
    job = polled.job
  }

  if (job.status !== 'success' || !job.asset?.id) {
    throw new Error(`asset upload ${job.id} ${job.status}: ${job.error?.message ?? 'no asset id'}`)
  }
  return job.asset.id
}
