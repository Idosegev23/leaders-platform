import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { generateInfluencerBrief } from '@/lib/influencer-brief/generate'

export const runtime = 'nodejs'
export const maxDuration = 60

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/**
 * Approve a creative deck. Employee-only.
 * 1. Stamps approved_at / approved_by on the deck.
 * 2. Generates the influencer brief DOCUMENT (item 3) from the deck's _stepData.
 *
 * The trigger is explicit approval. If a client-signature-on-deck flow is
 * added later, call generateInfluencerBrief from there instead.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = service()

  const { data: deck, error: getErr } = await sb
    .from('documents')
    .select('id, type, approved_at')
    .eq('id', id)
    .single()
  if (getErr || !deck) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }
  if (deck.type !== 'deck') {
    return NextResponse.json({ error: 'Only decks can be approved' }, { status: 400 })
  }

  const approvedAt = deck.approved_at || new Date().toISOString()
  if (!deck.approved_at) {
    const { error: updErr } = await sb
      .from('documents')
      .update({
        approved_at: approvedAt,
        approved_by: user.email || user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (updErr) {
      return NextResponse.json({ error: `Approve failed: ${updErr.message}` }, { status: 500 })
    }
  }

  // Generate the influencer brief document (non-blocking on approval).
  let influencerBrief: { documentId: string; pdfUrl: string } | null = null
  let briefError: string | null = null
  try {
    influencerBrief = await generateInfluencerBrief(id)
  } catch (e) {
    briefError = e instanceof Error ? e.message : String(e)
    console.error('[approve] influencer-brief generation failed:', briefError)
  }

  return NextResponse.json({
    ok: true,
    approved_at: approvedAt,
    influencerBrief,
    briefError,
  })
}
