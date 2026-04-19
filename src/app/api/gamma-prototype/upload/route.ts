import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      userId = user.id
    }

    const fd = await req.formData()
    const file = fd.get('file') as File | null
    const kind = (fd.get('kind') as string) || 'image'
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    const ext = file.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')
    const fileName = `gamma-media/${userId}/${Date.now()}.${ext}`
    const buf = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from('documents')
      .upload(fileName, buf, { contentType: file.type, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data } = supabase.storage.from('documents').getPublicUrl(fileName)
    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    console.error('[gamma-upload] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
