import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestId = `feedback-${Date.now()}`

  try {
    const body = await request.json()
    const { documentId, rating, whatWorked, whatDidntWork, tags } = body

    if (!documentId || !rating) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log(`[${requestId}] Feedback: doc=${documentId} rating=${rating} tags=${tags?.join(',')}`)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.warn(`[${requestId}] No Supabase credentials, storing feedback in logs only`)
      return NextResponse.json({ success: true, stored: 'logs' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Try to insert into feedback table. If table doesn't exist yet, just log it.
    const { error } = await supabase.from('feedback').insert({
      document_id: documentId,
      rating,
      what_worked: whatWorked || null,
      what_didnt_work: whatDidntWork || null,
      tags: tags || [],
      created_at: new Date().toISOString(),
    })

    if (error) {
      // Table might not exist yet - that's OK, just log
      console.warn(`[${requestId}] Supabase insert error (table may not exist):`, error.message)
      return NextResponse.json({ success: true, stored: 'logs' })
    }

    console.log(`[${requestId}] Feedback stored successfully`)
    return NextResponse.json({ success: true, stored: 'database' })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Feedback submission failed' },
      { status: 500 }
    )
  }
}
