import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateImage } from '@/lib/gemini/image'

export const maxDuration = 600
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // In dev mode, use mock user - just need to verify auth
    if (!isDevMode) {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json()
    const { prompt, documentId, referenceImageUrl, styleContext } = body as {
      prompt: string
      documentId?: string
      referenceImageUrl?: string
      styleContext?: string
    }

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Compose final prompt with brand/presentation style context
    let finalPrompt = prompt
    if (styleContext) {
      finalPrompt = `${prompt}\n\n[Style context — match this aesthetic closely]:\n${styleContext}`
    }

    // If a reference image is provided, fetch it and pass as inline data (img2img)
    let referenceImage: { base64: string; mimeType: string } | undefined
    if (referenceImageUrl) {
      try {
        console.log(`[Image] Fetching reference: ${referenceImageUrl}`)
        const refRes = await fetch(referenceImageUrl)
        if (!refRes.ok) throw new Error(`ref fetch ${refRes.status}`)
        const mimeType = refRes.headers.get('content-type') || 'image/jpeg'
        const buf = Buffer.from(await refRes.arrayBuffer())
        referenceImage = { base64: buf.toString('base64'), mimeType }
        finalPrompt = `${finalPrompt}\n\n[Reference image provided — use its subject/composition as the starting point. Preserve key elements from the reference but apply the requested style.]`
      } catch (e) {
        console.warn('[Image] Reference fetch failed, continuing without:', e)
      }
    }

    // Generate image using Gemini 3 Pro Image Preview (4K quality)
    const result = await generateImage(finalPrompt, {
      aspectRatio: '16:9',
      imageSize: '4K',
      referenceImage,
    })

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to generate image' },
        { status: 500 }
      )
    }

    // Convert base64 to buffer and upload to Supabase Storage
    const imageBuffer = Buffer.from(result.base64, 'base64')
    const fileName = `generated_${Date.now()}.${result.mimeType.split('/')[1]}`

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('assets')
      .upload(fileName, imageBuffer, {
        contentType: result.mimeType,
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to save image' }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)

    // Save to database if documentId provided
    if (documentId) {
      await supabase.from('generated_images').insert({
        document_id: documentId,
        prompt,
        image_url: urlData.publicUrl,
        source: 'gemini_3_pro',
        metadata: { mimeType: result.mimeType },
      })
    }

    return NextResponse.json({
      success: true,
      imageUrl: urlData.publicUrl,
      prompt,
    })
  } catch (error) {
    console.error('Image generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )
  }
}


