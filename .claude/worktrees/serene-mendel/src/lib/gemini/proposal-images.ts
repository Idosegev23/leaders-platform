/**
 * Generate images for proposal slides using Gemini 3 Pro Image (Nano Banana Pro)
 * Model: gemini-3-pro-image-preview
 * Features: True 4K resolution native rendering, highly art-directed prompts
 */

import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Using the newest multimodal image generation model
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

interface ProposalData {
  brandName?: string
  brandDescription?: string
  targetGender?: string
  targetAgeRange?: string
  targetBehavior?: string
  activity?: string
  [key: string]: unknown
}

interface GeneratedImages {
  brandImage?: string
  audienceImage?: string
}

interface ImagePrompt {
  key: keyof GeneratedImages
  prompt: string
}

/**
 * Generate image prompts based on proposal data
 * Creates premium, highly art-directed lifestyle images for the proposal slides
 */
function generateImagePrompts(data: ProposalData): ImagePrompt[] {
  const prompts: ImagePrompt[] = []

  // Brand image - lifestyle representation for cover and brand slide
  const brandInfo = data.brandDescription || data.brandName
  if (brandInfo) {
    prompts.push({
      key: 'brandImage',
      prompt: `Create a breathtaking, award-winning editorial photograph for a high-end corporate presentation.

Brand Context: ${data.brandName || 'modern luxury brand'}
Essence: ${data.brandDescription?.slice(0, 300) || 'premium lifestyle and innovation'}

Requirements:
- Style: Vogue-style editorial, high-end commercial advertising photography
- Mood: Aspirational, sophisticated, visionary, and clean
- Lighting: Cinematic, soft studio lighting or dramatic natural golden hour, hyper-detailed
- Composition: Wide cinematic shot, full bleed, perfect for a presentation background slide
- Subject: Authentic but striking visual metaphor or real people in a premium modern environment
- Text: ABSOLUTELY NO TEXT, NO LOGOS, NO WATERMARKS, NO GRAPHICS
- Quality: Photorealistic, 8k resolution, masterpiece, highly detailed`
    })
  }

  // Audience image - target demographic for goals/audience slide
  if (data.targetGender || data.targetAgeRange) {
    const gender = data.targetGender === 'נשים' ? 'women' : 
                   data.targetGender === 'גברים' ? 'men' : 'a diverse mixed group of people'
    const age = data.targetAgeRange || '25-40'
    const behavior = data.targetBehavior || 'living an active, modern lifestyle'
    
    prompts.push({
      key: 'audienceImage',
      prompt: `Create a captivating, dynamic lifestyle portrait showing the target audience for a premium marketing campaign.

Target Demographic: ${gender}, ages ${age}
Lifestyle & Behavior: ${behavior}

Requirements:
- Scene: Authentic, candid, yet highly polished real-life situation
- People: Relatable but aspirational, expressive, stylish
- Mood: Vibrant, engaged, deeply connected, inspiring
- Style: High-end Instagram-worthy, editorial street style or elegant indoor setting
- Lighting: Beautiful natural lighting, sharp focus, beautiful depth of field (bokeh)
- Text: ABSOLUTELY NO TEXT, NO LOGOS, NO WATERMARKS
- Quality: Photorealistic, 8k resolution, shot on 35mm lens, masterpiece`
    })
  }

  return prompts
}

/**
 * Generate a single image using Gemini 3 Pro Image (Nano Banana Pro)
 */
async function generateSingleImage(prompt: string): Promise<string | null> {
  try {
    console.log('[Gemini 3 Pro Image] Generating:', prompt.slice(0, 80) + '...')
    
    const config: any = {
      responseModalities: ['image', 'text'],
      imageConfig: {
        aspectRatio: '16:9',
        imageSize: '4K', // Explicitly request native 4K output from Nano Banana
      }
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: config
    })

    // Extract image from response parts
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64 = part.inlineData.data
        const mimeType = part.inlineData.mimeType || 'image/jpeg'
        console.log('[Gemini 3 Pro Image] Successfully generated image, mime:', mimeType)
        return `data:${mimeType};base64,${base64}`
      }
    }

    console.log('[Gemini 3 Pro Image] No image found in response parts')
    return null
  } catch (error) {
    console.error('[Gemini 3 Pro Image] Error during generation:', error)
    return null
  }
}

/**
 * Upload image to Supabase Storage
 */
async function uploadImage(
  base64Data: string, 
  documentId: string, 
  imageKey: string
): Promise<string | null> {
  try {
    const supabase = await createClient()
    
    // Extract mime type and data
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/)
    if (!matches) {
      console.error('[Upload] Invalid base64 string format')
      return null
    }
    
    const mimeType = matches[1]
    const data = matches[2]
    const extension = mimeType.split('/')[1] || 'jpeg'
    
    const buffer = Buffer.from(data, 'base64')
    const fileName = `proposal_${documentId}_${imageKey}_${Date.now()}.${extension}`
    
    const { error } = await supabase.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: mimeType,
        upsert: true,
      })
    
    if (error) {
      console.error('[Upload] Supabase Error:', error)
      return null
    }
    
    const { data: urlData } = supabase.storage
      .from('assets')
      .getPublicUrl(fileName)
    
    console.log('[Upload] Success. URL created:', fileName)
    return urlData.publicUrl
  } catch (error) {
    console.error('[Upload] Unexpected Error:', error)
    return null
  }
}

/**
 * Generate all images for a proposal
 */
export async function generateProposalImages(
  data: ProposalData,
  documentId: string
): Promise<GeneratedImages> {
  console.log('[Gemini] Input data received for image generation:', {
    brandName: data.brandName,
    brandDescription: data.brandDescription?.slice(0, 50),
    targetGender: data.targetGender,
    targetAgeRange: data.targetAgeRange,
  })
  
  const prompts = generateImagePrompts(data)
  const images: GeneratedImages = {}
  
  console.log(`[Gemini] Starting generation of ${prompts.length} premium images...`)
  console.log('[Gemini] Image types in queue:', prompts.map(p => p.key))
  
  // Generate images sequentially to avoid rate limits on the 4K model
  for (const { key, prompt } of prompts) {
    try {
      const base64 = await generateSingleImage(prompt)
      if (base64) {
        const url = await uploadImage(base64, documentId, key)
        if (url) {
          images[key] = url
        }
      }
      // Small delay between heavy 4K requests to keep the API happy
      await new Promise(resolve => setTimeout(resolve, 800))
    } catch (error) {
      console.error(`[Gemini] Failed to generate or upload ${key}:`, error)
    }
  }
  
  console.log('[Gemini] Image generation cycle complete. Keys populated:', Object.keys(images))
  
  return images
}

/**
 * Generate placeholder background for missing images
 */
export function getPlaceholderBackground(type: string): string {
  const backgrounds: Record<string, string> = {
    brand: '#F9FAFB',
    audience: '#F3F4F6',
    cover: '#EBECEC',
  }
  return backgrounds[type] || '#F5F5F5'
}