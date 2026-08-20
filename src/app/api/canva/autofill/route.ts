import { NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import {
  autofillFromBrandTemplate,
  getBrandTemplateDataset,
  textData,
  uploadAssetFromUrl,
  type AutofillFieldValue,
} from '@/lib/canva/brand-templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/canva/autofill
 * { brandTemplateId, title?, data: Record<string, string | AutofillFieldValue> }
 *
 * Fills a Canva brand template with data and returns the new design's links.
 * Plain-string values become text fields; unknown field keys (not in the
 * template's dataset) are dropped with a warning instead of failing the job.
 * Auth: logged-in Leaders user or x-internal-secret.
 */
export async function POST(request: Request) {
  const secret = process.env.LEADS_TRIGGER_SECRET || ''
  const isInternalTrigger = !!secret && request.headers.get('x-internal-secret') === secret
  if (!isInternalTrigger) {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as {
    brandTemplateId?: string
    title?: string
    data?: Record<string, string | AutofillFieldValue>
  } | null
  if (!body?.brandTemplateId || !body.data || typeof body.data !== 'object') {
    return NextResponse.json({ error: 'brandTemplateId and data required' }, { status: 400 })
  }

  try {
    const dataset = await getBrandTemplateDataset(body.brandTemplateId)
    if (!Object.keys(dataset).length) {
      return NextResponse.json(
        { error: 'Template has no autofill fields — tag elements and republish first' },
        { status: 409 },
      )
    }

    const data: Record<string, AutofillFieldValue> = {}
    const dropped: string[] = []
    for (const [key, value] of Object.entries(body.data)) {
      if (!dataset[key]) {
        dropped.push(key)
        continue
      }
      if (typeof value === 'string') {
        // Image fields accept a plain URL — we download + upload it as a
        // Canva asset (e.g. rehosted influencer profile pics from Supabase).
        if (dataset[key].type === 'image') {
          try {
            const assetId = await uploadAssetFromUrl(value, key)
            data[key] = { type: 'image', asset_id: assetId }
          } catch (e) {
            console.warn(`[canva-autofill] image upload failed for ${key} (dropping):`, e instanceof Error ? e.message : e)
            dropped.push(key)
          }
        } else {
          data[key] = textData({ [key]: value })[key]
        }
      } else {
        data[key] = value
      }
    }
    if (!Object.keys(data).length) {
      return NextResponse.json(
        { error: `No provided fields match the template dataset (${Object.keys(dataset).join(', ')})` },
        { status: 400 },
      )
    }

    const result = await autofillFromBrandTemplate({
      brandTemplateId: body.brandTemplateId,
      title: body.title,
      data,
    })

    return NextResponse.json({
      ok: true,
      design_id: result.designId,
      edit_url: result.editUrl,
      view_url: result.viewUrl,
      dropped_fields: dropped.length ? dropped : undefined,
    })
  } catch (e) {
    console.error('[canva-autofill] failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 502 })
  }
}
