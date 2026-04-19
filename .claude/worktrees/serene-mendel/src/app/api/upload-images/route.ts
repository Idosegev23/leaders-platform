import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

/**
 * Upload base64 images to Supabase Storage
 * Returns public URLs for each uploaded image
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Auth check
    let userId = DEV_AUTH_USER.id
    if (!isDevMode) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }
    
    const body = await request.json()
    const { images, prefix } = body as {
      images: Record<string, string>
      prefix: string
    }
    
    if (!images || typeof images !== 'object') {
      return NextResponse.json({ error: 'Invalid images data' }, { status: 400 })
    }
    
    const timestamp = Date.now()
    const uploadedUrls: Record<string, string> = {}
    
    // Process each image
    for (const [key, value] of Object.entries(images)) {
      if (!value) continue
      
      // Already a URL - keep as is
      if (value.startsWith('http')) {
        uploadedUrls[key] = value
        continue
      }
      
      // Not a base64 data URL - skip
      if (!value.startsWith('data:image/')) {
        continue
      }
      
      try {
        // Parse base64
        const parts = value.split(',')
        const mimeMatch = parts[0].match(/:(.*?);/)
        const mime = mimeMatch ? mimeMatch[1] : 'image/png'
        const base64Data = parts[1]
        
        // Convert to buffer
        const buffer = Buffer.from(base64Data, 'base64')
        
        // Determine extension
        const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png'
        const fileName = `proposals/${userId}/${prefix}_${key}_${timestamp}.${ext}`
        
        // Upload to Supabase
        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(fileName, buffer, {
            contentType: mime,
            upsert: true,
          })
        
        if (uploadError) {
          console.error(`[Upload] Failed ${key}:`, uploadError)
          continue
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('assets')
          .getPublicUrl(fileName)
        
        uploadedUrls[key] = urlData.publicUrl
        console.log(`[Upload] ${key} -> ${urlData.publicUrl.slice(0, 60)}...`)
      } catch (err) {
        console.error(`[Upload] Error processing ${key}:`, err)
      }
    }
    
    return NextResponse.json({
      success: true,
      urls: uploadedUrls,
      count: Object.keys(uploadedUrls).length,
    })
  } catch (error) {
    console.error('[Upload] API error:', error)
    return NextResponse.json(
      { error: 'Upload failed' },
      { status: 500 }
    )
  }
}


