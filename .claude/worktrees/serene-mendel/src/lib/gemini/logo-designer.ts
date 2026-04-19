/**
 * Logo Designer Service
 * Uses Gemini to create variations and designs based on client logo
 */

import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

// Model for image generation - Nano Banana Pro
const IMAGE_MODEL = 'gemini-3-pro-image-preview'
// Model for analysis — Flash primary, Pro fallback
const FLASH_ANALYSIS_MODEL = 'gemini-3-flash-preview'
const PRO_ANALYSIS_MODEL = 'gemini-3.1-pro-preview'

export interface LogoDesign {
  type: 'watermark' | 'pattern' | 'hero-background' | 'color-extraction' | 'decorative'
  imageData: string // Base64
  description: string
}

export interface LogoAnalysis {
  colors: {
    primary: string
    secondary: string
    accent: string
    palette: string[]
  }
  style: {
    type: string // minimalist, ornate, geometric, organic, etc.
    keywords: string[]
  }
  suggestions: {
    backgroundPatterns: string[]
    complementaryElements: string[]
    fontSuggestions: string[]
  }
}

/**
 * Analyze a logo image and extract design insights
 */
export async function analyzeLogoForDesign(
  logoUrl: string
): Promise<LogoAnalysis> {
  console.log('[Logo Designer] Analyzing logo for design insights')
  
  // Skip SVG files - Gemini can't process them as images
  if (logoUrl.endsWith('.svg') || logoUrl.includes('.svg?')) {
    console.log('[Logo Designer] Skipping SVG logo - not supported, using defaults')
    return getDefaultLogoAnalysis()
  }
  
  const logoData = await fetchImageAsBase64(logoUrl).catch(() => null)
  if (!logoData) return getDefaultLogoAnalysis()

  const analysisPrompt = `אתה מעצב גרפי בכיר. נתח את הלוגו הזה ותן לי:

1. **צבעים** - חלץ את הצבעים המדויקים (hex codes):
   - צבע ראשי
   - צבע משני
   - צבע הדגשה
   - פלטת צבעים מלאה

2. **סגנון עיצובי**:
   - סוג (מינימליסטי/גאומטרי/אורגני/קלאסי/מודרני)
   - מילות מפתח לסגנון

3. **המלצות**:
   - 3 רעיונות לפטרנים לרקע
   - 3 אלמנטים משלימים
   - 3 המלצות לפונטים שיתאימו

החזר JSON:
\`\`\`json
{
  "colors": {
    "primary": "#XXXXXX",
    "secondary": "#XXXXXX",
    "accent": "#XXXXXX",
    "palette": ["#XXX", "#XXX", "#XXX"]
  },
  "style": {
    "type": "סוג הסגנון",
    "keywords": ["מילה1", "מילה2"]
  },
  "suggestions": {
    "backgroundPatterns": ["רעיון1", "רעיון2", "רעיון3"],
    "complementaryElements": ["אלמנט1", "אלמנט2", "אלמנט3"],
    "fontSuggestions": ["פונט1", "פונט2", "פונט3"]
  }
}
\`\`\``

  // Flash first (fast + cheap for vision), Pro fallback
  const models = [FLASH_ANALYSIS_MODEL, PRO_ANALYSIS_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/png', data: logoData } },
              { text: analysisPrompt },
            ],
          },
        ],
      })

      const text = response.text || ''
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        if (attempt > 0) console.log(`[Logo Designer] ✅ Analysis succeeded with fallback (${model})`)
        return JSON.parse(jsonMatch[1]) as LogoAnalysis
      }
      throw new Error('No JSON in response')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Logo Designer] Analysis attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Logo Designer] All analysis attempts failed, using defaults')
  return getDefaultLogoAnalysis()
}

/**
 * Generate a watermark version of the logo
 */
export async function generateLogoWatermark(
  logoUrl: string,
  opacity: number = 0.1
): Promise<LogoDesign | null> {
  console.log('[Logo Designer] Creating watermark from logo')
  
  try {
    const logoData = await fetchImageAsBase64(logoUrl)
    
    // Use generateContent with imageConfig for Nano Banana Pro
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: `Create a subtle watermark pattern based on the brand colors and style. 
              The result should be:
              - Very light and transparent (${opacity * 100}% opacity)
              - Suitable as a background watermark
              - Repeatable pattern
              - Professional and elegant
              
              Size: 400x400 pixels
              Background: Transparent or white
              Style: Subtle, barely visible, professional`,
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      })

    const imageData = extractImageFromResponse(response)
    if (imageData) {
      return {
        type: 'watermark',
        imageData,
        description: 'Logo watermark pattern',
      }
    }
    
    return null
  } catch (error) {
    console.error('[Logo Designer] Watermark error:', error)
    return null
  }
}

/**
 * Generate a pattern based on logo elements
 */
export async function generateLogoPattern(
  logoUrl: string,
  style: 'geometric' | 'organic' | 'minimal' | 'abstract' = 'geometric'
): Promise<LogoDesign | null> {
  console.log(`[Logo Designer] Creating ${style} pattern from logo`)
  
  try {
    const logoData = await fetchImageAsBase64(logoUrl)
    
    const stylePrompts = {
      geometric: 'geometric shapes inspired by the logo, clean lines, repeating pattern',
      organic: 'flowing organic shapes derived from logo curves, natural feel',
      minimal: 'minimal dots or simple shapes based on logo colors, lots of white space',
      abstract: 'abstract artistic interpretation of logo elements, modern and bold',
    }
    
    // Use generateContent with imageConfig for Nano Banana Pro
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: `Create a seamless background pattern.
              
              Style: ${stylePrompts[style]}
              
              Requirements:
              - Seamless/tileable pattern
              - Subtle and professional
              - 16:9 aspect ratio
              - Can work as a presentation background
              - Keep it elegant, not overwhelming`,
        config: {
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '2K',
          },
        },
      })

    const imageData = extractImageFromResponse(response)
    if (imageData) {
      return {
        type: 'pattern',
        imageData,
        description: `${style} pattern from logo`,
      }
    }
    
    return null
  } catch (error) {
    console.error('[Logo Designer] Pattern error:', error)
    return null
  }
}

/**
 * Generate a hero background with logo integration
 */
export async function generateHeroWithLogo(
  logoUrl: string,
  brandName: string,
  industry: string,
  mood: string = 'professional'
): Promise<LogoDesign | null> {
  console.log('[Logo Designer] Creating hero background with logo')
  
  try {
    const logoData = await fetchImageAsBase64(logoUrl)
    
    const moodStyles = {
      professional: 'clean, corporate, sophisticated, premium feel',
      creative: 'artistic, bold colors, dynamic composition',
      friendly: 'warm, inviting, approachable, bright',
      luxury: 'elegant, dark, gold accents, high-end feel',
      tech: 'modern, futuristic, blue tones, digital elements',
    }
    
    // Use generateContent with imageConfig for Nano Banana Pro
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: `Create a stunning hero background for a presentation about "${brandName}" in the ${industry} industry.
              
              The background should:
              - Have a ${moodStyles[mood as keyof typeof moodStyles] || moodStyles.professional} style
              - Be 16:9 ratio
              - Have space for text overlay (leave center-right area cleaner)
              - Feel cohesive and professional
              - Modern Israeli aesthetic
              
              This is for an Israeli marketing agency pitch. No text in the image.`,
        config: {
          imageConfig: {
            aspectRatio: '16:9',
            imageSize: '2K',
          },
        },
      })

    const imageData = extractImageFromResponse(response)
    if (imageData) {
      return {
        type: 'hero-background',
        imageData,
        description: `Hero background for ${brandName}`,
      }
    }
    
    return null
  } catch (error) {
    console.error('[Logo Designer] Hero error:', error)
    return null
  }
}

/**
 * Generate decorative elements based on logo
 */
export async function generateDecorativeElements(
  logoUrl: string,
  count: number = 3
): Promise<LogoDesign[]> {
  console.log('[Logo Designer] Creating decorative elements from logo')
  
  const elements: LogoDesign[] = []
  const elementTypes = [
    'corner accent shape',
    'divider line element',
    'abstract blob shape',
    'geometric frame element',
  ]
  
  try {
    const logoData = await fetchImageAsBase64(logoUrl)
    
    for (let i = 0; i < Math.min(count, elementTypes.length); i++) {
      // Use generateContent with imageConfig for Nano Banana Pro
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: `Create a ${elementTypes[i]} for a professional presentation.
                
                Requirements:
                - Modern and minimal design
                - 1:1 aspect ratio
                - Clean and elegant
                - Can be used as a decorative element in a presentation`,
        config: {
          imageConfig: {
            aspectRatio: '1:1',
            imageSize: '2K',
          },
        },
      })

      const imageData = extractImageFromResponse(response)
      if (imageData) {
        elements.push({
          type: 'decorative',
          imageData,
          description: elementTypes[i],
        })
      }
    }
  } catch (error) {
    console.error('[Logo Designer] Decorative elements error:', error)
  }
  
  return elements
}

/**
 * Generate all brand assets from logo
 */
export async function generateBrandAssetsFromLogo(
  logoUrl: string,
  brandName: string,
  industry: string
): Promise<{
  analysis: LogoAnalysis
  designs: LogoDesign[]
}> {
  console.log(`[Logo Designer] Generating full brand assets for ${brandName}`)
  
  // First, analyze the logo
  const analysis = await analyzeLogoForDesign(logoUrl)
  
  // Generate designs in parallel
  const [watermark, pattern, hero] = await Promise.all([
    generateLogoWatermark(logoUrl, 0.08),
    generateLogoPattern(logoUrl, 'geometric'),
    generateHeroWithLogo(logoUrl, brandName, industry),
  ])
  
  const designs: LogoDesign[] = []
  if (watermark) designs.push(watermark)
  if (pattern) designs.push(pattern)
  if (hero) designs.push(hero)
  
  console.log(`[Logo Designer] Generated ${designs.length} brand assets`)
  
  return { analysis, designs }
}

// Helper functions

async function fetchImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.toString('base64')
  } catch (error) {
    console.error('[Logo Designer] Failed to fetch image:', error)
    throw error
  }
}

function extractImageFromResponse(response: unknown): string | null {
  try {
    // Try to get image data from response
    const resp = response as { 
      candidates?: Array<{ 
        content?: { 
          parts?: Array<{ 
            inlineData?: { data?: string } 
          }> 
        } 
      }> 
    }
    const candidates = resp.candidates
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data
        }
      }
    }
    return null
  } catch {
    return null
  }
}

function getDefaultLogoAnalysis(): LogoAnalysis {
  return {
    colors: {
      primary: '#000000',
      secondary: '#666666',
      accent: '#0066CC',
      palette: ['#000000', '#666666', '#0066CC', '#FFFFFF'],
    },
    style: {
      type: 'modern',
      keywords: ['clean', 'professional'],
    },
    suggestions: {
      backgroundPatterns: ['subtle gradient', 'geometric dots', 'soft waves'],
      complementaryElements: ['thin lines', 'rounded shapes', 'minimal icons'],
      fontSuggestions: ['Heebo', 'Assistant', 'Open Sans'],
    },
  }
}

