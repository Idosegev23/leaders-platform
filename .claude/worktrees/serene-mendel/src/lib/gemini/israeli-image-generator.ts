/**
 * Israeli Market Image Generator
 * Uses Gemini 3 Pro Image for creating images optimized for the Israeli market
 * with proper Hebrew text support and local aesthetics
 * 
 * Now includes Smart Image Generation:
 * - AI analyzes brand and creates custom image strategy
 * - AI writes optimized prompts for each image
 * - Flexible number of images based on brand needs
 */

import { GoogleGenAI } from '@google/genai'
import type { BrandResearch } from './brand-research'
import type { BrandColors } from './color-extractor'
import type { ProposalContent } from '../openai/proposal-writer'
import { analyzeAndPlanImages, type ImageStrategy } from './image-strategist'
import { generateSmartPrompts, smartPromptToText, type SmartImagePrompt, type GeneratedPrompts } from './smart-prompt-generator'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

// Nano Banana Pro - Gemini 3 Pro Image model
const IMAGE_MODEL = 'gemini-3-pro-image-preview'

// Retry configuration
const MAX_RETRIES = 3
const RETRY_DELAY_BASE = 1000 // 1 second

export interface IsraeliImage {
  type: 'cover' | 'lifestyle' | 'infographic' | 'social' | 'hero' | 'product' | 'team'
  imageData: Buffer
  mimeType: string
  prompt: string
  aspectRatio: string
}

export interface ImageGenerationConfig {
  aspectRatio?: '16:9' | '1:1' | '4:5' | '9:16'
  resolution?: '2K' | '4K'
  style?: 'photorealistic' | 'illustration' | 'minimal' | 'bold'
  includeHebrewText?: boolean
  hebrewText?: string
  brandColors?: string[]
  referenceImages?: string[] // Up to 14 reference images
}

/**
 * Generate image with retry logic using generateContent with imageConfig
 * This is the correct API for Nano Banana Pro (gemini-3-pro-image-preview)
 */
async function generateWithRetry(
  prompt: string,
  aspectRatio: string = '16:9',
  logoBuffer?: Buffer | null,
): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[Israeli Image] Attempt ${attempt}/${MAX_RETRIES} | Model: ${IMAGE_MODEL} | generateContent${logoBuffer ? ' (with logo ref)' : ''}`)

      // Build contents: text prompt + optional logo as reference image
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contents: any[] = []
      if (logoBuffer) {
        // Pass logo as reference image — Gemini will integrate it naturally
        contents.push({
          text: `${prompt}\n\nIMPORTANT: Naturally integrate the provided brand logo into the image. Place it prominently but elegantly — on a product, sign, screen, or surface that fits the scene. The logo must be clearly visible and pixel-perfect, not distorted or cropped.`,
        })
        contents.push({
          inlineData: {
            mimeType: 'image/png',
            data: logoBuffer.toString('base64'),
          },
        })
      } else {
        contents.push({ text: prompt })
      }

      const callStart = Date.now()
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio: aspectRatio as '16:9' | '1:1' | '4:5' | '9:16',
            imageSize: '2K',
          },
        },
      })
      const callDuration = ((Date.now() - callStart) / 1000).toFixed(1)

      // Extract image from response parts
      const parts = response.candidates?.[0]?.content?.parts
      const candidateCount = response.candidates?.length || 0
      const partCount = parts?.length || 0
      const hasImage = parts?.some(p => !!p.inlineData?.data) || false
      const hasText = parts?.some(p => !!p.text) || false
      console.log(`[Israeli Image] Response in ${callDuration}s: ${candidateCount} candidates, ${partCount} parts, hasImage=${hasImage}, hasText=${hasText}`)

      if (hasText && !hasImage) {
        const textContent = parts?.find(p => p.text)?.text?.slice(0, 200)
        console.log(`[Israeli Image] Model returned text instead of image: "${textContent}"`)
      }

      if (parts) {
        for (const part of parts) {
          const inlineData = part.inlineData
          if (inlineData?.data) {
            const sizeKb = Math.round(Buffer.from(inlineData.data, 'base64').length / 1024)
            console.log(`[Israeli Image] Success on attempt ${attempt} (${sizeKb}KB)`)
            return Buffer.from(inlineData.data, 'base64')
          }
        }
      }

      console.log(`[Israeli Image] No image data on attempt ${attempt}`)
    } catch (error) {
      console.error(`[Israeli Image] Attempt ${attempt} failed:`, error)

      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * attempt
        console.log(`[Israeli Image] Waiting ${delay}ms before retry...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  console.log(`[Israeli Image] All ${MAX_RETRIES} attempts failed`)
  return null
}

/**
 * Generate a cover/hero image for Israeli market
 */
export async function generateIsraeliCoverImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  config: ImageGenerationConfig = {}
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating cover for ${brandResearch.brandName}`)
  
  const industry = brandResearch.industry || 'lifestyle'
  const audience = brandResearch.targetDemographics?.primaryAudience
  const mood = brandResearch.brandPersonality?.join(', ') || 'modern, professional'
  
  // Build Israeli-focused prompt
  const prompt = `
Create a stunning hero image for an Israeli brand presentation.

Brand: ${brandResearch.brandName}
Industry: ${industry}
Target Audience: Israeli ${audience?.gender || 'adults'}, age ${audience?.ageRange || '25-45'}
Brand Personality: ${mood}
Primary Colors: ${brandColors.primary}, ${brandColors.secondary || brandColors.accent}

Style Requirements:
- Modern Israeli aesthetic
- Mediterranean vibes with urban sophistication
- Warm, inviting lighting typical of Tel Aviv
- Clean composition with space for text overlay on the right side (RTL layout)
- Professional but approachable feel
- Lifestyle imagery showing Israeli diversity
${config.style === 'photorealistic' ? '- Photorealistic, high-end advertising quality' : ''}
${config.style === 'minimal' ? '- Minimalist, lots of white space, elegant' : ''}

Technical:
- Aspect ratio: ${config.aspectRatio || '16:9'}
- High resolution, crisp details
- Brand colors incorporated subtly in the scene

CRITICAL REQUIREMENT - NO TEXT:
- Generate ONLY a visual/photographic image
- Do NOT include ANY text, letters, words, logos, or typography
- Do NOT include brand names, slogans, or captions
- The image must be purely visual - text will be overlaid separately
- If you see text in your output, regenerate without it

DO NOT include: generic stock photo feel, cold/sterile environments, non-Israeli aesthetics, any text or writing
`.trim()

  const imageData = await generateWithRetry(prompt, config.aspectRatio || '16:9')
  
  if (imageData) {
    return {
      type: 'cover',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: config.aspectRatio || '16:9',
    }
  }
  
  return null
}

/**
 * Generate lifestyle image showing Israeli audience
 */
export async function generateIsraeliLifestyleImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  scenario: 'urban' | 'beach' | 'home' | 'work' | 'social' = 'urban'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${scenario} lifestyle image`)
  
  const audience = brandResearch.targetDemographics?.primaryAudience
  const interests = audience?.interests?.slice(0, 3).join(', ') || 'lifestyle, wellness'
  
  const scenarios = {
    urban: 'Tel Aviv street scene, trendy coffee shop, modern Israeli urban lifestyle',
    beach: 'Mediterranean beach atmosphere, Israeli coastal lifestyle, relaxed but sophisticated',
    home: 'Modern Israeli apartment, warm family setting, contemporary home design',
    work: 'Israeli startup office, collaborative workspace, tech-savvy professionals',
    social: 'Friends gathering, Israeli social scene, diverse group having fun',
  }
  
  const prompt = `
Create an authentic Israeli lifestyle photograph.

Setting: ${scenarios[scenario]}
People: Israeli ${audience?.gender || 'mixed'}, ${audience?.ageRange || '25-40'} years old
Interests: ${interests}
Mood: ${brandResearch.brandPersonality?.join(', ') || 'warm, authentic, aspirational'}

Visual Style:
- Natural, authentic Israeli look (not American or European)
- Mediterranean lighting - warm, golden hour feel
- Diverse Israeli faces (Ashkenazi, Mizrachi, Ethiopian, etc.)
- Casual elegance typical of Israeli urban culture
- Real, relatable moments
- Colors inspired by: ${brandColors.primary}, ${brandColors.accent}

Technical:
- 16:9 aspect ratio
- High quality, editorial style
- Depth of field with subject focus

CRITICAL - NO TEXT: Generate a purely visual/photographic image with absolutely NO text, letters, words, logos, brand names, watermarks, or typography of any kind.

Avoid: staged/fake looking, cold lighting, homogeneous looks, any text or writing
`.trim()

  const imageData = await generateWithRetry(prompt, '16:9')
  
  if (imageData) {
    return {
      type: 'lifestyle',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: '16:9',
    }
  }
  
  return null
}

/**
 * Generate infographic with Hebrew text
 */
export async function generateIsraeliInfographic(
  title: string,
  dataPoints: { label: string; value: string }[],
  brandColors: BrandColors,
  style: 'stats' | 'process' | 'comparison' = 'stats'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${style} infographic`)
  
  const dataText = dataPoints.map(d => `${d.label}: ${d.value}`).join('\n')
  
  const prompt = `
Create a professional Hebrew infographic for a business presentation.

Type: ${style === 'stats' ? 'Statistics/KPIs display' : style === 'process' ? 'Process flow' : 'Comparison chart'}

Data to display (in Hebrew):
${dataText}

Design Requirements:
- Right-to-left layout (Hebrew)
- Primary color: ${brandColors.primary}
- Accent color: ${brandColors.accent || brandColors.secondary}
- Clean, modern design
- Large, readable Hebrew typography
- Professional business aesthetic
- Icons or simple illustrations for each data point

Style:
- Minimalist with bold accents
- White or light background
- Strong visual hierarchy
- Easy to read from a distance (presentation slide)

Aspect ratio: 16:9
Resolution: High quality for presentations

IMPORTANT: Hebrew text must be accurate and properly rendered, reading right-to-left.
`.trim()

  const imageData = await generateWithRetry(prompt, '16:9')
  
  if (imageData) {
    return {
      type: 'infographic',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: '16:9',
    }
  }
  
  return null
}

/**
 * Generate social media style image
 */
export async function generateIsraeliSocialImage(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  platform: 'instagram' | 'facebook' | 'linkedin' = 'instagram'
): Promise<IsraeliImage | null> {
  console.log(`[Israeli Image] Generating ${platform} social image`)
  
  const aspectRatios = {
    instagram: '1:1' as const,
    facebook: '16:9' as const,
    linkedin: '16:9' as const,
  }
  
  const prompt = `
Create an engaging social media image for an Israeli brand.

Brand: ${brandResearch.brandName}
Industry: ${brandResearch.industry}
Platform: ${platform}

Style:
- Trendy, scroll-stopping design
- Israeli social media aesthetic
- Bold use of brand color: ${brandColors.primary}
- Modern, clean composition
- Lifestyle feel with product/service integration
- Aspirational but authentic

Technical:
- ${platform === 'instagram' ? 'Square format, Instagram-ready' : 'Horizontal format'}
- Vibrant but not oversaturated
- Mobile-first design
- High contrast for small screens

CRITICAL - NO TEXT: Generate a purely visual/photographic image with absolutely NO text, letters, words, logos, brand names, or typography of any kind. Text will be overlaid separately.
`.trim()

  const imageData = await generateWithRetry(prompt, aspectRatios[platform])
  
  if (imageData) {
    return {
      type: 'social',
      imageData,
      mimeType: 'image/png',
      prompt,
      aspectRatio: aspectRatios[platform],
    }
  }
  
  return null
}

/**
 * Generate a complete set of images for a proposal
 */
export async function generateIsraeliProposalImages(
  brandResearch: BrandResearch,
  brandColors: BrandColors
): Promise<{
  cover: IsraeliImage | null
  lifestyle: IsraeliImage | null
  audience: IsraeliImage | null
  activity: IsraeliImage | null
}> {
  console.log(`[Israeli Image] Generating full proposal image set for ${brandResearch.brandName}`)
  
  // Generate all images in parallel
  const [cover, lifestyle, audience, activity] = await Promise.all([
    generateIsraeliCoverImage(brandResearch, brandColors, { style: 'photorealistic' }),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'urban'),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'social'),
    generateIsraeliLifestyleImage(brandResearch, brandColors, 'work'),
  ])
  
  console.log(`[Israeli Image] Generated: cover=${!!cover}, lifestyle=${!!lifestyle}, audience=${!!audience}, activity=${!!activity}`)
  
  return { cover, lifestyle, audience, activity }
}

/**
 * Convert IsraeliImage to data URL for embedding in HTML
 */
export function israeliImageToDataUrl(image: IsraeliImage): string {
  return `data:${image.mimeType};base64,${image.imageData.toString('base64')}`
}

// ============================================
// SMART IMAGE GENERATION SYSTEM
// ============================================

export interface SmartGeneratedImage {
  id: string
  placement: string
  imageData: Buffer
  mimeType: string
  prompt: SmartImagePrompt
  aspectRatio: string
}

export interface SmartImageSet {
  strategy: ImageStrategy
  promptsData: GeneratedPrompts
  images: SmartGeneratedImage[]
  // Legacy compatibility mapping
  legacyMapping: {
    cover?: SmartGeneratedImage
    brand?: SmartGeneratedImage
    audience?: SmartGeneratedImage
    activity?: SmartGeneratedImage
  }
}

/**
 * Generate a single image from a smart prompt
 */
async function generateFromSmartPrompt(
  smartPrompt: SmartImagePrompt,
  logoBuffer?: Buffer | null,
): Promise<SmartGeneratedImage | null> {
  console.log(`[Smart Image] Generating: ${smartPrompt.imageId}`)

  const textPrompt = smartPromptToText(smartPrompt)
  const imageData = await generateWithRetry(textPrompt, smartPrompt.aspectRatio, logoBuffer)
  
  if (imageData) {
    return {
      id: smartPrompt.imageId,
      placement: smartPrompt.placement,
      imageData,
      mimeType: 'image/png',
      prompt: smartPrompt,
      aspectRatio: smartPrompt.aspectRatio,
    }
  }
  
  return null
}

/**
 * Generate images using the smart AI system
 * This is the new recommended approach
 */
export async function generateSmartImages(
  brandResearch: BrandResearch,
  brandColors: BrandColors,
  proposalContent?: Partial<ProposalContent>,
  clientLogoUrl?: string | null,
): Promise<SmartImageSet> {
  console.log(`[Smart Image] Starting smart generation for ${brandResearch.brandName}`)

  // Fetch client logo buffer once (if available) for reference image integration
  let logoBuffer: Buffer | null = null
  if (clientLogoUrl) {
    try {
      console.log(`[Smart Image] Fetching client logo for reference: ${clientLogoUrl}`)
      const logoRes = await fetch(clientLogoUrl, { signal: AbortSignal.timeout(8000) })
      if (logoRes.ok) {
        logoBuffer = Buffer.from(await logoRes.arrayBuffer())
        console.log(`[Smart Image] Logo fetched: ${logoBuffer.length} bytes`)
      }
    } catch (err) {
      console.log(`[Smart Image] Logo fetch failed, generating without logo:`, err)
    }
  }

  // Step 1: AI analyzes brand and creates strategy
  console.log('[Smart Image] Step 1: Creating image strategy...')
  const strategy = await analyzeAndPlanImages(brandResearch, brandColors, proposalContent)
  console.log(`[Smart Image] Strategy created: ${strategy.images.length} images planned`)

  // Step 2: AI generates optimized prompts
  console.log('[Smart Image] Step 2: Generating smart prompts...')
  const promptsData = await generateSmartPrompts(strategy, brandResearch, brandColors)
  console.log(`[Smart Image] Prompts generated: ${promptsData.prompts.length}`)

  // Step 3: Generate images in parallel (prioritize essential ones)
  console.log(`[Smart Image] Step 3: Generating images...${logoBuffer ? ' (with logo integration)' : ''}`)

  // Sort by priority - essential first
  const sortedPrompts = [...promptsData.prompts].sort((a, b) => {
    const priorityOrder = { essential: 0, recommended: 1, optional: 2 }
    return priorityOrder[a.priority] - priorityOrder[b.priority]
  })

  // Generate all images in parallel — pass logo buffer so Gemini integrates it naturally
  const imagePromises = sortedPrompts.map(prompt => generateFromSmartPrompt(prompt, logoBuffer))
  const results = await Promise.all(imagePromises)
  
  // Filter out nulls
  const images = results.filter((img): img is SmartGeneratedImage => img !== null)
  const succeeded = images.length
  const failed = sortedPrompts.length - succeeded
  console.log(`[Smart Image] Generation complete: ${succeeded} succeeded, ${failed} failed out of ${sortedPrompts.length} total`)
  for (let i = 0; i < sortedPrompts.length; i++) {
    const sp = sortedPrompts[i]
    const ok = results[i] !== null
    console.log(`[Smart Image]   ${ok ? 'OK' : 'FAIL'} — ${sp.imageId} (${sp.priority}, ${sp.placement})`)
  }
  
  // Create legacy mapping for backward compatibility
  const legacyMapping: SmartImageSet['legacyMapping'] = {}
  
  for (const img of images) {
    if (img.placement === 'cover' && !legacyMapping.cover) {
      legacyMapping.cover = img
    } else if ((img.placement === 'brand' || img.placement === 'lifestyle') && !legacyMapping.brand) {
      legacyMapping.brand = img
    } else if (img.placement === 'audience' && !legacyMapping.audience) {
      legacyMapping.audience = img
    } else if ((img.placement === 'activity' || img.placement === 'product') && !legacyMapping.activity) {
      legacyMapping.activity = img
    }
  }
  
  // Fill in missing legacy slots
  const unassigned = images.filter(img => 
    img !== legacyMapping.cover && 
    img !== legacyMapping.brand && 
    img !== legacyMapping.audience && 
    img !== legacyMapping.activity
  )
  
  if (!legacyMapping.cover && unassigned.length > 0) {
    legacyMapping.cover = unassigned.shift()
  }
  if (!legacyMapping.brand && unassigned.length > 0) {
    legacyMapping.brand = unassigned.shift()
  }
  if (!legacyMapping.audience && unassigned.length > 0) {
    legacyMapping.audience = unassigned.shift()
  }
  if (!legacyMapping.activity && unassigned.length > 0) {
    legacyMapping.activity = unassigned.shift()
  }
  
  console.log('[Smart Image] Legacy mapping:', {
    cover: !!legacyMapping.cover,
    brand: !!legacyMapping.brand,
    audience: !!legacyMapping.audience,
    activity: !!legacyMapping.activity,
  })
  
  return {
    strategy,
    promptsData,
    images,
    legacyMapping,
  }
}

/**
 * Convert SmartGeneratedImage to IsraeliImage for compatibility
 */
export function smartImageToIsraeliImage(
  smartImage: SmartGeneratedImage,
  type: IsraeliImage['type'] = 'cover'
): IsraeliImage {
  return {
    type,
    imageData: smartImage.imageData,
    mimeType: smartImage.mimeType,
    prompt: smartPromptToText(smartImage.prompt),
    aspectRatio: smartImage.aspectRatio,
  }
}

// Re-export types for convenience
export type { ImageStrategy, ImagePlan } from './image-strategist'
export type { SmartImagePrompt, GeneratedPrompts } from './smart-prompt-generator'
