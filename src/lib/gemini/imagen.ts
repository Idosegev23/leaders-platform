/**
 * Gemini 3 Pro Image Generation
 * Creates premium lifestyle images for proposals using the gemini-3-pro-image-preview model
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// The multimodal Gemini 3 Pro Image Preview model
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
  type: 'cover' | 'brand' | 'audience' | 'lifestyle'
}

export interface ImageGenerationOptions {
  aspectRatio?: '16:9' | '1:1' | '9:16' | '4:3' | '3:4'
  style?: 'editorial' | 'lifestyle' | 'minimal' | 'vibrant'
  includeColors?: boolean
  imageSize?: '2K' | '4K'
}

/**
 * Generate a brand-aligned cover image
 */
export async function generateCoverImage(
  brandResearch: BrandResearch,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors 
    ? `Color palette inspiration: ${brandColors.primary}, ${brandColors.secondary}. Mood: ${brandColors.mood}.`
    : ''

  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  const audienceGender = primaryAudience?.gender || 'diverse'
  const audienceAge = primaryAudience?.ageRange || '25-45'
  const personality = brandResearch.brandPersonality?.join(', ') || 'modern, professional'

  const prompt = `A premium, ${options.style || 'editorial'}-quality cover image for a marketing presentation. 
Brand: ${brandResearch.brandName}. Industry: ${brandResearch.industry}. Target audience: ${audienceGender}, ages ${audienceAge}. Brand personality: ${personality}. 
${colorContext} 
Style: High-end commercial photography, professional, aspirational, and modern mood. 
Full bleed composition suitable as a presentation background. Real people in authentic situations if applicable. 
Modern premium aesthetic, cinematic lighting. 
Absolutely NO text, NO logos, NO overlays, NO graphics. Should feel aligned with the corporate brand identity.`

  return generateImage(prompt, 'cover', options)
}

/**
 * Generate a brand lifestyle image
 */
export async function generateBrandImage(
  brandResearch: BrandResearch,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors
    ? `Color palette inspiration: ${brandColors.palette?.join(', ') || brandColors.primary}. Mood: ${brandColors.mood}.`
    : ''

  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  const audienceGender = primaryAudience?.gender || 'diverse'
  const audienceAge = primaryAudience?.ageRange || '25-45'
  const interests = primaryAudience?.interests?.join(', ') || 'lifestyle, quality'
  const brandValues = brandResearch.brandValues?.join(', ') || 'quality, innovation'

  const prompt = `A lifestyle photograph that represents the essence of the brand "${brandResearch.brandName}". 
Industry: ${brandResearch.industry}. Brand values: ${brandValues}. Market position: ${brandResearch.marketPosition || 'premium'}. 
Target audience: ${audienceGender}, ages ${audienceAge}. Interests: ${interests}. 
${colorContext} 
Style: ${options.style || 'lifestyle'}, authentic, natural candid feel. Show the brand's world and aesthetic. 
Feature real people if relevant to the industry. Natural lighting, modern aspirational setting. 
Photorealistic. Absolutely NO text, NO logos.`

  return generateImage(prompt, 'brand', options)
}

/**
 * Generate a target audience image
 */
export async function generateAudienceImage(
  brandResearch: BrandResearch,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const primaryAudience = brandResearch.targetDemographics?.primaryAudience
  
  // Translate to English for the model
  const genderRaw = primaryAudience?.gender || 'נשים וגברים'
  let gender = 'mixed group of people'
  if (genderRaw.includes('נשים') && !genderRaw.includes('גברים')) gender = 'women'
  if (genderRaw.includes('גברים') && !genderRaw.includes('נשים')) gender = 'men'

  const ageRange = primaryAudience?.ageRange || '25-45'
  const socioeconomic = primaryAudience?.socioeconomic || 'middle-upper class'
  const interests = primaryAudience?.interests?.join(', ') || 'lifestyle, quality products'
  const behavior = brandResearch.targetDemographics?.behavior || 'active consumers'

  const prompt = `A lifestyle photograph showing the target demographic for "${brandResearch.brandName}". 
Demographics: ${gender}, ages ${ageRange}. Socioeconomic status: ${socioeconomic}. 
Interests: ${interests}. Consumer behavior: ${behavior}. 
Style: ${options.style || 'lifestyle'}, Instagram-worthy, authentic. 
Show these people in real-life relatable situations. Positive, engaged, connected vibe. 
Modern setting, natural lighting, high-end commercial photography. 
Absolutely NO text, NO logos.`

  return generateImage(prompt, 'audience', options)
}

/**
 * Generate a generic lifestyle image for a specific theme
 */
export async function generateLifestyleImage(
  theme: string,
  brandColors?: BrandColors,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const colorContext = brandColors
    ? `Color inspiration: ${brandColors.palette.join(', ')}.`
    : ''

  const prompt = `A premium lifestyle photograph representing the theme: "${theme}". 
${colorContext} 
Style: ${options.style || 'lifestyle'}, high-quality editorial photography. 
Modern, aspirational aesthetic. Natural lighting, authentic and not staged. 
Sharp focus. Absolutely NO text, NO logos, NO graphics.`

  return generateImage(prompt, 'lifestyle', options)
}

/**
 * Core image generation function using the new Gemini 3 Pro multimodal capabilities
 */
async function generateImage(
  prompt: string,
  type: GeneratedImage['type'],
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  console.log(`[Gemini 3 Pro] Generating ${type} image using ${IMAGE_MODEL}...`)
  
  try {
    const config: any = {
      responseModalities: ['image', 'text'],
      imageConfig: {
        aspectRatio: options.aspectRatio || '16:9',
        imageSize: options.imageSize || '4K'
      }
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: config
    })

    // Extract image from response parts
    const candidates = response.candidates || []
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []
      for (const part of parts) {
        if (part.inlineData) {
          console.log(`[Gemini 3 Pro] Generated ${type} image successfully`)
          return {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/jpeg',
            prompt,
            type,
          }
        }
      }
    }

    console.log('[Gemini 3 Pro] No image found in the response parts')
    return null
  } catch (error) {
    console.error('[Gemini 3 Pro] Generation error:', error)
    return null
  }
}

/**
 * Generate all proposal images in parallel
 */
export async function generateProposalImages(
  brandResearch: BrandResearch,
  brandColors?: BrandColors
): Promise<{
  coverImage?: GeneratedImage
  brandImage?: GeneratedImage
  audienceImage?: GeneratedImage
}> {
  console.log(`[Gemini 3 Pro] Generating all images for ${brandResearch.brandName}`)
  
  const [coverImage, brandImage, audienceImage] = await Promise.all([
    generateCoverImage(brandResearch, brandColors),
    generateBrandImage(brandResearch, brandColors),
    generateAudienceImage(brandResearch),
  ])
  
  const results = {
    coverImage: coverImage || undefined,
    brandImage: brandImage || undefined,
    audienceImage: audienceImage || undefined,
  }
  
  console.log(`[Gemini 3 Pro] Generated ${Object.values(results).filter(Boolean).length}/3 images`)
  
  return results
}

/**
 * Convert generated image to data URL
 */
export function imageToDataUrl(image: GeneratedImage): string {
  return `data:${image.mimeType};base64,${image.base64}`
}

/**
 * Upload generated image to storage and get URL
 */
export async function uploadGeneratedImage(
  image: GeneratedImage,
  documentId: string,
  supabaseClient: { storage: { from: (bucket: string) => { upload: (path: string, buffer: Buffer, options: { contentType: string; upsert: boolean }) => Promise<{ error: Error | null }>; getPublicUrl: (path: string) => { data: { publicUrl: string } } } } }
): Promise<string | null> {
  try {
    const buffer = Buffer.from(image.base64, 'base64')
    const extension = image.mimeType.split('/')[1] || 'jpeg'
    const fileName = `proposal_${documentId}_${image.type}_${Date.now()}.${extension}`
    
    const { error } = await supabaseClient.storage
      .from('assets')
      .upload(fileName, buffer, {
        contentType: image.mimeType,
        upsert: true,
      })
    
    if (error) {
      console.error('[Upload] Error:', error)
      return null
    }
    
    const { data } = supabaseClient.storage
      .from('assets')
      .getPublicUrl(fileName)
    
    return data.publicUrl
  } catch (error) {
    console.error('[Upload] Error:', error)
    return null
  }
}