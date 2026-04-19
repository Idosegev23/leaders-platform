import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateId } from '@/lib/utils'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

// POST - Create new document
export async function POST(request: NextRequest) {
  const requestId = `doc-create-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${requestId}] 📝 CREATE DOCUMENT - START`)
  console.log(`${'='.repeat(60)}`)

  try {
    const supabase = await createClient()

    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const authStart = Date.now()
      const { data: { user: authUser } } = await supabase.auth.getUser()
      console.log(`[${requestId}] 🔐 Auth check: ${Date.now() - authStart}ms - ${authUser ? `user=${authUser.id}` : 'NO USER'}`)
      if (!authUser) {
        console.log(`[${requestId}] ❌ Unauthorized - no authenticated user`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    } else {
      console.log(`[${requestId}] 🔧 Dev mode - using mock user: ${userId}`)
    }

    const body = await request.json()
    const { type, title, data } = body

    console.log(`[${requestId}] 📋 Type: ${type}`)
    console.log(`[${requestId}] 📋 Title: ${title}`)
    console.log(`[${requestId}] 📋 Data keys: ${data ? Object.keys(data).join(', ') : 'MISSING'}`)
    console.log(`[${requestId}] 📋 Data size: ${data ? JSON.stringify(data).length : 0} chars`)

    if (!type || !title || !data) {
      console.log(`[${requestId}] ❌ Missing required fields - type:${!!type}, title:${!!title}, data:${!!data}`)
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const documentId = generateId()
    console.log(`[${requestId}] 🆔 Generated document ID: ${documentId}`)

    const insertStart = Date.now()
    const { error: insertError } = await supabase.from('documents').insert({
      id: documentId,
      user_id: isDevMode ? null : userId,
      type: type as 'quote' | 'deck',
      title,
      data,
      status: 'draft',
    })

    if (insertError) {
      console.error(`[${requestId}] ❌ Insert failed after ${Date.now() - insertStart}ms:`, insertError.message)
      console.error(`[${requestId}] ❌ Insert error details:`, JSON.stringify(insertError))
      return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
    }

    console.log(`[${requestId}] ✅ Document created in ${Date.now() - insertStart}ms`)
    console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    console.log(`${'='.repeat(60)}\n`)

    return NextResponse.json({
      success: true,
      id: documentId,
      message: 'Document created successfully'
    })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET - List documents
export async function GET() {
  const requestId = `doc-list-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${requestId}] 📋 LIST DOCUMENTS - START`)

  try {
    const supabase = await createClient()

    // In dev mode, get all documents (no user filter)
    if (isDevMode) {
      console.log(`[${requestId}] 🔧 Dev mode - fetching all documents`)
      const queryStart = Date.now()
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error(`[${requestId}] ❌ Query failed after ${Date.now() - queryStart}ms:`, error.message)
        return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
      }

      console.log(`[${requestId}] ✅ Fetched ${documents?.length || 0} documents in ${Date.now() - queryStart}ms`)
      console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
      return NextResponse.json({ documents })
    }

    // Normal mode - filter by user
    const authStart = Date.now()
    const { data: { user } } = await supabase.auth.getUser()
    console.log(`[${requestId}] 🔐 Auth check: ${Date.now() - authStart}ms - ${user ? `user=${user.id}` : 'NO USER'}`)

    if (!user) {
      console.log(`[${requestId}] ❌ Unauthorized - no authenticated user`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const queryStart = Date.now()
    const { data: documents, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error(`[${requestId}] ❌ Query failed after ${Date.now() - queryStart}ms:`, error.message)
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
    }

    console.log(`[${requestId}] ✅ Fetched ${documents?.length || 0} documents for user ${user.id} in ${Date.now() - queryStart}ms`)
    console.log(`[${requestId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)
    return NextResponse.json({ documents })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
