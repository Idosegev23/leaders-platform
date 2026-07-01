// src/lib/canva/client.ts
import { getValidAccessToken } from './oauth'

/**
 * Canva url-import: pull our already-generated deck (a PUBLIC Drive PDF/PPTX
 * URL) into a new Canva design.
 *
 * Endpoints (verbatim):
 *   POST https://api.canva.com/rest/v1/url-imports   { title, url, mime_type? }
 *   GET  https://api.canva.com/rest/v1/url-imports/{jobId}
 *
 * NOTE: Canva edit_url (deep-link into the editor) expires ~30 days after it
 * is minted. We persist canva_design_id alongside it so a new edit link can be
 * re-issued from the design id when the old one lapses.
 */

const BASE = 'https://api.canva.com/rest/v1'
const POLL_INTERVAL_MS = 2500
const MAX_POLLS = 40 // ~100s ceiling

export interface UrlImportJobResult {
  designId: string
  editUrl: string
  viewUrl: string
}

interface UrlImportJobResponse {
  job: {
    id: string
    status: 'in_progress' | 'success' | 'failed'
    result?: {
      designs?: Array<{
        id: string
        urls?: { edit_url?: string; view_url?: string }
      }>
    }
    error?: { code?: string; message?: string }
  }
}

export async function importDesignFromUrl(args: {
  title: string
  url: string
  mimeType?: string
}): Promise<{ jobId: string }> {
  const accessToken = await getValidAccessToken()
  const body: Record<string, string> = { title: args.title, url: args.url }
  if (args.mimeType) body.mime_type = args.mimeType

  const res = await fetch(`${BASE}/url-imports`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Canva url-import create ${res.status}: ${text.slice(0, 400)}`)
  }
  const data = JSON.parse(text) as UrlImportJobResponse
  const jobId = data.job?.id
  if (!jobId) throw new Error(`Canva url-import: no job id in response: ${text.slice(0, 200)}`)
  return { jobId }
}

export async function waitForUrlImport(jobId: string): Promise<UrlImportJobResult> {
  const accessToken = await getValidAccessToken()
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(`${BASE}/url-imports/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(`Canva url-import poll ${res.status}: ${text.slice(0, 400)}`)
    }
    const data = JSON.parse(text) as UrlImportJobResponse
    const status = data.job?.status
    if (status === 'success') {
      const design = data.job.result?.designs?.[0]
      if (!design?.id) {
        throw new Error(`Canva url-import succeeded but no design returned: ${text.slice(0, 200)}`)
      }
      return {
        designId: design.id,
        editUrl: design.urls?.edit_url ?? `https://www.canva.com/design/${design.id}/edit`,
        viewUrl: design.urls?.view_url ?? `https://www.canva.com/design/${design.id}/view`,
      }
    }
    if (status === 'failed') {
      throw new Error(`Canva url-import failed: ${data.job.error?.message ?? 'unknown error'}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`Canva url-import timed out after ${MAX_POLLS} polls (job ${jobId})`)
}
