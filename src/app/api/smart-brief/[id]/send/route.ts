import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { smartBriefServiceClient } from '@/lib/smart-brief/service'

export const dynamic = 'force-dynamic'

/** POST /api/smart-brief/[id]/send — mark as sent, return the public share URL */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = smartBriefServiceClient()

  const { data, error } = await service
    .from('smart_briefs')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('share_token')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 500 })

  const origin = request.nextUrl.origin
  return NextResponse.json({ url: `${origin}/forms/brief/${data.share_token}` })
}
