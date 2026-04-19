import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

// GET - Get single document
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = `doc-get-${Date.now()}`
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { id } = await params
    console.log(`[${requestId}] 📄 GET DOCUMENT: ${id}`)

    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      console.log(`[${requestId}] 🔐 Auth: ${authUser ? `user=${authUser.id}` : 'NO USER'}`)
      if (!authUser) {
        console.log(`[${requestId}] ❌ Unauthorized`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    } else {
      console.log(`[${requestId}] 🔧 Dev mode`)
    }

    const queryStart = Date.now()
    const { data: document, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !document) {
      console.log(`[${requestId}] ❌ Document not found (${Date.now() - queryStart}ms): ${error?.message || 'null'}`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    console.log(`[${requestId}] ✅ Found document in ${Date.now() - queryStart}ms`)
    console.log(`[${requestId}]   Title: ${document.title}`)
    console.log(`[${requestId}]   Type: ${document.type}`)
    console.log(`[${requestId}]   Status: ${document.status}`)
    console.log(`[${requestId}]   Owner: ${document.user_id}`)

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      console.log(`[${requestId}] ❌ Forbidden - owner ${document.user_id} != user ${userId}`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log(`[${requestId}] ⏱️ TOTAL: ${Date.now() - startTime}ms`)
    return NextResponse.json({ document })
  } catch (error) {
    console.error(`[${requestId}] ❌ ERROR after ${Date.now() - startTime}ms:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update document data
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = `doc-patch-${Date.now()}`
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { id } = await params
    console.log(`\n[${requestId}] ✏️ PATCH DOCUMENT: ${id}`)

    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      console.log(`[${requestId}] 🔐 Auth: ${authUser ? `user=${authUser.id}` : 'NO USER'}`)
      if (!authUser) {
        console.log(`[${requestId}] ❌ Unauthorized`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    // Get existing document
    const getStart = Date.now()
    const { data: document, error: getError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (getError || !document) {
      console.log(`[${requestId}] ❌ Document not found (${Date.now() - getStart}ms)`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }
    console.log(`[${requestId}] 📄 Found document in ${Date.now() - getStart}ms: "${document.title}"`)

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      console.log(`[${requestId}] ❌ Forbidden - owner ${document.user_id} != user ${userId}`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get updates from request body
    const updates = await request.json()
    const updateKeys = Object.keys(updates)
    console.log(`[${requestId}] 📋 Update keys: [${updateKeys.join(', ')}]`)
    console.log(`[${requestId}] 📋 Update size: ${JSON.stringify(updates).length} chars`)

    // Merge updates with existing data
    const existingData = document.data as Record<string, unknown> || {}
    const existingKeys = Object.keys(existingData)
    const mergedData = { ...existingData, ...updates }
    console.log(`[${requestId}] 🔄 Merging: ${existingKeys.length} existing + ${updateKeys.length} new keys = ${Object.keys(mergedData).length} total`)

    // Update document
    const updateStart = Date.now()
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        data: mergedData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error(`[${requestId}] ❌ Update failed after ${Date.now() - updateStart}ms:`, updateError.message)
      return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
    }

    console.log(`[${requestId}] ✅ Updated in ${Date.now() - updateStart}ms`)
    console.log(`[${requestId}] ⏱️ TOTAL: ${Date.now() - startTime}ms`)

    return NextResponse.json({
      success: true,
      message: 'Document updated successfully'
    })
  } catch (error) {
    console.error(`[${requestId}] ❌ ERROR after ${Date.now() - startTime}ms:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete document
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = `doc-del-${Date.now()}`
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const { id } = await params
    console.log(`\n[${requestId}] 🗑️ DELETE DOCUMENT: ${id}`)

    // In dev mode, use mock user
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      console.log(`[${requestId}] 🔐 Auth: ${authUser ? `user=${authUser.id}` : 'NO USER'}`)
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = authUser.id
    }

    // Get existing document
    const { data: document, error: getError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single()

    if (getError || !document) {
      console.log(`[${requestId}] ❌ Document not found`)
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    console.log(`[${requestId}] 📄 Found: "${document.title}" (type: ${document.type}, status: ${document.status})`)

    // Verify ownership (skip in dev mode)
    if (!isDevMode && document.user_id !== userId) {
      console.log(`[${requestId}] ❌ Forbidden`)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete document
    const deleteStart = Date.now()
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error(`[${requestId}] ❌ Delete failed:`, deleteError.message)
      return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
    }

    console.log(`[${requestId}] ✅ Deleted in ${Date.now() - deleteStart}ms`)
    console.log(`[${requestId}] ⏱️ TOTAL: ${Date.now() - startTime}ms`)

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    })
  } catch (error) {
    console.error(`[${requestId}] ❌ ERROR after ${Date.now() - startTime}ms:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
