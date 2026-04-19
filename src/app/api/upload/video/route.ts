import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30
import { createClient } from '@/lib/supabase/server'

import { getAuthenticatedUser } from '@/lib/auth/api-auth'

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = await createClient()

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Video validation
    const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB
    const ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json({ error: `Unsupported video type: ${file.type}` }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4'
    const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: '31536000',
        upsert: false,
      })

    if (uploadError) {
      console.error('[video-upload] Storage error:', uploadError)
      // Common: bucket doesn't exist
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
        return NextResponse.json({ error: 'Storage bucket "videos" not configured. Create it in Supabase Dashboard → Storage.' }, { status: 500 })
      }
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('[video-upload] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
