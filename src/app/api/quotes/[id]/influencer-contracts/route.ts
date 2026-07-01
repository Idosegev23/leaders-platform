import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { uploadBufferToDriveFolder } from '@/lib/google-drive/client'
import { DRIVE_ANCHORS } from '@/lib/google-drive/client-folders'
import { resolveDeckInfluencers } from '@/lib/influencer-contract/deck'
import {
  buildInfluencerContractData,
  generateInfluencerContractPdf,
  type ContractOverrides,
} from '@/lib/influencer-contract/generate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

/**
 * POST /api/quotes/{id}/influencer-contracts
 * id = the signed client quote's signature_requests.id.
 *
 * Body (all optional):
 *   { deck_document_id?, overrides?: ContractOverrides,
 *     deliverables_by_handle?: Record<string,string[]>,
 *     fee_by_handle?: Record<string,string> }
 *
 * For each influencer in the linked deck, creates a signature_requests row
 * (own token) with the contract PDF uploaded public to Drive + a /sign/{token} link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const sb = service()

  // 1. Load + gate the client quote.
  const { data: quote, error: qErr } = await sb
    .from('signature_requests')
    .select('id, title, status, recipient_name, created_by_email, created_by_name, payload')
    .eq('id', id)
    .maybeSingle()
  if (qErr || !quote) {
    return NextResponse.json({ ok: false, error: 'הצעת המחיר לא נמצאה' }, { status: 404 })
  }
  if (quote.status !== 'signed') {
    return NextResponse.json(
      { ok: false, error: 'ניתן ליצור חוזי משפיעניות רק לאחר חתימת הלקוח על הצעת המחיר' },
      { status: 409 },
    )
  }

  // 2. Resolve the deck id (body -> quote payload).
  const body = (await request.json().catch(() => ({}))) as {
    deck_document_id?: string
    overrides?: ContractOverrides
    deliverables_by_handle?: Record<string, string[]>
    fee_by_handle?: Record<string, string>
  }
  const quotePayload = (quote.payload ?? {}) as { deck_document_id?: string }
  const deckDocId = (body.deck_document_id || quotePayload.deck_document_id || '').trim()
  if (!deckDocId) {
    return NextResponse.json(
      { ok: false, error: 'חסר מזהה מצגת (deck_document_id) לשליפת רשימת המשפיעניות' },
      { status: 400 },
    )
  }

  const deck = await resolveDeckInfluencers(sb, deckDocId)
  if (!deck) {
    return NextResponse.json({ ok: false, error: 'המצגת המקושרת לא נמצאה' }, { status: 404 })
  }
  if (deck.influencers.length === 0) {
    return NextResponse.json({ ok: false, error: 'אין משפיעניות ברשימת המצגת' }, { status: 422 })
  }

  // 3. Skip influencers that already have a contract cloned from THIS quote.
  const { data: existing } = await sb
    .from('signature_requests')
    .select('payload')
    .eq('parent_signature_request_id', id)
  const existingHandles = new Set(
    (existing ?? [])
      .map((r) => (r.payload as { influencer?: { handle?: string } } | null)?.influencer?.handle)
      .filter(Boolean) as string[],
  )

  const base = appBaseUrl()
  const created: Array<{ influencer_name: string; handle: string; token: string; sign_url: string; drive_link: string }> = []
  const skipped: Array<{ influencer_name: string; handle: string; reason: string }> = []

  for (const inf of deck.influencers) {
    const handle = inf.username?.startsWith('@') ? inf.username : `@${inf.username ?? ''}`
    if (existingHandles.has(handle)) {
      skipped.push({ influencer_name: inf.name || handle, handle, reason: 'חוזה כבר קיים' })
      continue
    }

    const overrides: ContractOverrides = {
      ...body.overrides,
      deliverables: body.deliverables_by_handle?.[handle] ?? body.overrides?.deliverables,
      engagementFee: body.fee_by_handle?.[handle] ?? body.overrides?.engagementFee,
    }
    const contractData = buildInfluencerContractData(deck, inf, overrides)
    const title = `הסכם משפיען/ית — ${inf.name || handle} × ${deck.clientName}`

    // Render PDF.
    let pdf: Buffer
    try {
      pdf = await generateInfluencerContractPdf(contractData, base, title)
    } catch (e) {
      skipped.push({ influencer_name: inf.name || handle, handle, reason: `PDF נכשל: ${e instanceof Error ? e.message : e}` })
      continue
    }

    // Upload to Drive (public anyone-reader, same anchor as quotes).
    let uploaded: { id: string; viewLink: string }
    try {
      const res = await uploadBufferToDriveFolder({
        folderId: DRIVE_ANCHORS.BRIEFS_SENT,
        fileName: `${title} (טיוטה).pdf`,
        mimeType: 'application/pdf',
        buffer: pdf,
      })
      uploaded = { id: res.id, viewLink: res.viewLink }
    } catch (e) {
      skipped.push({ influencer_name: inf.name || handle, handle, reason: `Drive נכשל: ${e instanceof Error ? e.message : e}` })
      continue
    }

    // Create the signature_requests row (own token). payload snapshots the
    // contract data so /sign/{token}/sign regenerates the signed PDF from the
    // template — we register it under source 'influencer-contract'.
    const { data: sigReq, error: insErr } = await sb
      .from('signature_requests')
      .insert({
        title,
        recipient_email: '',              // filled by the account manager before send (see UI)
        recipient_name: inf.name || handle,
        pdf_drive_file_id: uploaded.id,
        pdf_drive_folder_id: DRIVE_ANCHORS.BRIEFS_SENT,
        pdf_drive_view_link: uploaded.viewLink,
        created_by_email: quote.created_by_email,
        created_by_name: quote.created_by_name ?? 'Leaders',
        cc_emails: [],
        status: 'pending',
        parent_signature_request_id: id,
        deck_document_id: deck.id,
        payload: {
          source: 'influencer-contract',
          deck_document_id: deck.id,
          parent_signature_request_id: id,
          influencer: { name: inf.name, handle, followers: inf.followers ?? null },
          // NOTE: sign endpoint regenerates from quote_data for source
          // 'price-quote'/'salesforce-quote'. For influencer contracts the
          // contract_data regeneration path in the sign endpoint applies.
          contract_data: contractData,
        },
      })
      .select('id, token')
      .single()

    if (insErr || !sigReq) {
      skipped.push({ influencer_name: inf.name || handle, handle, reason: insErr?.message ?? 'insert נכשל' })
      continue
    }

    created.push({
      influencer_name: inf.name || handle,
      handle,
      token: sigReq.token as string,
      sign_url: `${base}/sign/${sigReq.token}`,
      drive_link: uploaded.viewLink,
    })
  }

  return NextResponse.json({ ok: true, quote_id: id, deck_id: deck.id, created, skipped })
}

/** GET — list contracts already cloned from this signed quote. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const sb = service()
  const { data, error } = await sb
    .from('signature_requests')
    .select('id, token, title, recipient_name, recipient_email, status, signed_at, pdf_drive_view_link, signed_pdf_drive_view_link, payload')
    .eq('parent_signature_request_id', id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  const base = appBaseUrl()
  return NextResponse.json({
    ok: true,
    contracts: (data ?? []).map((r) => ({
      id: r.id,
      token: r.token,
      title: r.title,
      recipient_name: r.recipient_name,
      recipient_email: r.recipient_email,
      status: r.status,
      signed_at: r.signed_at,
      sign_url: `${base}/sign/${r.token}`,
      drive_link: r.pdf_drive_view_link,
      signed_link: r.signed_pdf_drive_view_link,
      handle: (r.payload as { influencer?: { handle?: string } } | null)?.influencer?.handle ?? null,
    })),
  })
}
