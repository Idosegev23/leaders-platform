/**
 * Gemini Vision Color Extractor
 * Uses Gemini's vision capabilities to extract brand colors from logos and images
 */

import { GoogleGenAI } from '@google/genai'
import { callAI } from '@/lib/ai-provider'

// Vision-only client — callAI doesn't support multimodal (inlineData) content,
// so extractColorsFromLogo & analyzeDesignStyle still need direct Gemini access.
const visionClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 600_000 },
})

const MODEL = 'gemini-3-flash-preview' // Color extraction doesn't need Pro reasoning
const FALLBACK_MODEL = 'gemini-3.1-pro-preview'

export interface BrandColors {
  primary: string       // Main brand color (HEX)
  secondary: string     // Secondary color (HEX)
  accent: string        // Accent/highlight color (HEX)
  background: string    // Suggested background (HEX)
  text: string          // Suggested text color (HEX)
  palette: string[]     // Full color palette (HEX)
  
  // Design style
  style: 'minimal' | 'bold' | 'elegant' | 'playful' | 'corporate'
  mood: string          // Description of the color mood
}

export interface DesignStyle {
  colorScheme: 'light' | 'dark' | 'colorful'
  typography: 'modern' | 'classic' | 'playful' | 'minimalist'
  overallStyle: string
  recommendations: string[]
}

/**
 * Extract colors from a logo image URL
 */
export async function extractColorsFromLogo(imageUrl: string): Promise<BrandColors | null> {
  console.log(`[Gemini Vision] Analyzing logo: ${imageUrl}`)

  // Skip SVG files - Gemini can't process them
  if (imageUrl.endsWith('.svg') || imageUrl.includes('.svg?')) {
    console.log('[Gemini Vision] Skipping SVG logo - not supported')
    return null
  }
  
  const prompt = `
אתה מומחה עיצוב גרפי. נתח את הלוגו בתמונה וחלץ את פלטת הצבעים של המותג.

החזר JSON בפורמט הבא:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#XXXXXX",
  "text": "#XXXXXX",
  "palette": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר של האווירה שהצבעים משדרים"
}
\`\`\`

חשוב:
- החזר צבעים בפורמט HEX בלבד
- primary = הצבע הדומיננטי בלוגו
- secondary = צבע משני אם קיים
- accent = צבע הדגשה (יכול להיות זהה ל-primary)
- background = צבע רקע מומלץ (לבן או כהה)
- text = צבע טקסט מומלץ
- palette = כל הצבעים שזיהית בלוגו
`

  try {
    const response = await visionClient.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: await fetchImageAsBase64(imageUrl)
              }
            }
          ]
        }
      ],
      config: {}
    })

    const text = response.text || ''
    console.log('[Gemini Vision] Color analysis received')
    
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as BrandColors
    }
    
    // Try to find JSON without code blocks
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as BrandColors
    }
    
    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini Vision] Color extraction error:', error)
    return null
  }
}

/**
 * Extract colors from CSS color array (from scraped website)
 */
export async function analyzeColorPalette(cssColors: string[]): Promise<BrandColors> {
  if (cssColors.length === 0) {
    return getDefaultColors()
  }
  
  const prompt = `
הנה רשימת צבעים שחולצו מאתר של מותג:
${cssColors.join(', ')}

נתח את הצבעים וקבע מה הפלטה הראשית של המותג.
החזר JSON:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#FFFFFF",
  "text": "#000000",
  "palette": ["#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר"
}
\`\`\`
`

  try {
    const aiResult = await callAI({
      model: MODEL,
      prompt,
      callerId: 'color-palette-analysis',
    })

    const text = aiResult.text || ''
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as BrandColors
    }

    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini] Color analysis error:', error)
    
    // Fallback: use first color as primary
    const primary = cssColors[0] || '#000000'
    return {
      ...getDefaultColors(),
      primary,
      accent: primary,
      palette: cssColors.slice(0, 5),
    }
  }
}

/**
 * Analyze design style from website screenshot or logo
 */
export async function analyzeDesignStyle(imageUrl: string): Promise<DesignStyle> {
  const prompt = `
נתח את סגנון העיצוב של התמונה (צילום מסך של אתר או לוגו).

החזר JSON:
\`\`\`json
{
  "colorScheme": "light/dark/colorful",
  "typography": "modern/classic/playful/minimalist",
  "overallStyle": "תיאור קצר של הסגנון הכללי",
  "recommendations": [
    "המלצה 1 לעיצוב מצגת",
    "המלצה 2",
    "המלצה 3"
  ]
}
\`\`\`
`

  try {
    const response = await visionClient.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/png',
                data: await fetchImageAsBase64(imageUrl)
              }
            }
          ]
        }
      ],
      config: {}
    })

    const text = response.text || ''
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]) as DesignStyle
    }
    
    throw new Error('No JSON in response')
  } catch (error) {
    console.error('[Gemini Vision] Style analysis error:', error)
    return {
      colorScheme: 'light',
      typography: 'modern',
      overallStyle: 'מינימליסטי ומקצועי',
      recommendations: [
        'שימוש ברקע לבן',
        'טיפוגרפיה נקייה',
        'הרבה אוויר לבן'
      ]
    }
  }
}

/**
 * Fetch image and convert to base64
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url)
    const buffer = await response.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch (error) {
    console.error('[Fetch] Error fetching image:', error)
    throw error
  }
}

/**
 * Extract brand colors by brand name using Gemini's knowledge
 * Fallback when website scraping fails to extract colors
 */
/** Parse a color extraction response from Gemini (supports code fences and raw JSON) */
function parseColorResponse(text: string): (BrandColors & { logoUrl?: string; websiteDomain?: string }) | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  const raw = jsonMatch ? jsonMatch[1] : (() => {
    const s = text.indexOf('{'), e = text.lastIndexOf('}')
    return s !== -1 && e > s ? text.slice(s, e + 1) : null
  })()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      primary: parsed.primary || '#111111',
      secondary: parsed.secondary || '#666666',
      accent: parsed.accent || parsed.primary || '#E94560',
      background: parsed.background || '#FFFFFF',
      text: parsed.text || '#111111',
      palette: parsed.palette || [parsed.primary, parsed.secondary, parsed.accent].filter(Boolean),
      style: parsed.style || 'corporate',
      mood: parsed.mood || 'מקצועי',
      logoUrl: parsed.logoUrl || undefined,
      websiteDomain: parsed.websiteDomain || undefined,
    }
  } catch {
    return null
  }
}

export async function extractColorsByBrandName(brandName: string, websiteUrl?: string): Promise<BrandColors & { logoUrl?: string; websiteDomain?: string }> {
  console.log(`[Gemini Colors] Analyzing brand by name: ${brandName}${websiteUrl ? ` (website: ${websiteUrl})` : ''}`)

  // ── Primary path: if we have a website URL, scrape it and extract REAL CSS colors ──
  // This is far more accurate than guessing from brand name alone.
  if (websiteUrl) {
    try {
      console.log(`[Gemini Colors] 🌐 Scraping website for real CSS colors: ${websiteUrl}`)
      const websiteResult = await callAI({
        model: 'gemini-3-flash-preview',
        prompt: `Visit this website and extract the REAL brand colors from its CSS/design:

Website: ${websiteUrl}

Look at:
1. CSS custom properties (--primary-color, --brand-color, etc.)
2. Header/nav background colors
3. Button colors (CTA buttons)
4. Logo colors visible on the page
5. Accent/highlight colors used for links or headings

Return JSON:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#FFFFFF",
  "text": "#111111",
  "palette": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר של האווירה",
  "confidence": "high/medium/low",
  "logoUrl": "URL of the logo image found on the page (or null)",
  "websiteDomain": "${new URL(websiteUrl).hostname}"
}
\`\`\`

IMPORTANT: Extract REAL colors from the actual website CSS. Do NOT guess.`,
        useUrlContext: true,
        useGoogleSearch: true,
        callerId: `color-from-website-${brandName}`,
      })

      const result = parseColorResponse(websiteResult.text || '')
      if (result) {
        console.log(`[Gemini Colors] ✅ Real colors from website: primary=${result.primary}, accent=${result.accent}`)
        return result
      }
    } catch (err) {
      console.warn(`[Gemini Colors] ⚠️ Website scrape failed, falling back to brand name lookup:`, err instanceof Error ? err.message : err)
    }
  }

  // ── Fallback: Ask Gemini with Google Search + URL Context grounding ──
  const prompt = `
אתה מומחה מיתוג. ניתן לך שם מותג ואתה צריך לזהות את פלטת הצבעים הרשמית שלו.

שם המותג: ${brandName}

חפש באינטרנט את האתר הרשמי של המותג וחלץ את הצבעים האמיתיים שלו.
אם לא מצאת — נסה להסיק מהתעשייה ומהשם.

החזר JSON בפורמט הבא:
\`\`\`json
{
  "primary": "#XXXXXX",
  "secondary": "#XXXXXX",
  "accent": "#XXXXXX",
  "background": "#FFFFFF",
  "text": "#111111",
  "palette": ["#XXXXXX", "#XXXXXX", "#XXXXXX"],
  "style": "minimal/bold/elegant/playful/corporate",
  "mood": "תיאור קצר של האווירה",
  "confidence": "high/medium/low",
  "logoUrl": "URL של הלוגו הרשמי של המותג אם ידוע לך (או null)",
  "websiteDomain": "הדומיין הרשמי של המותג (למשל: nike.com, adidas.co.il) — אם ידוע לך (או null)"
}
\`\`\`

חשוב מאוד:
- הצבעים חייבים להיות מדויקים ככל האפשר
- primary = הצבע הדומיננטי של המותג
- אל תחזיר צבעים כלליים אם אתה מכיר את המותג
`

  // Flash first (cheap + fast), Pro fallback if Flash fails
  const models = [MODEL, FALLBACK_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const aiResult = await callAI({
        model,
        prompt,
        useGoogleSearch: true,
        callerId: `color-by-brand-name-${brandName}`,
      })

      const result = parseColorResponse(aiResult.text || '')
      if (!result) throw new Error('No JSON in response')

      console.log(`[Gemini Colors] Brand "${brandName}" → primary=${result.primary}, accent=${result.accent} (model: ${model})`)
      if (attempt > 0) console.log(`[Gemini Colors] ✅ Succeeded with fallback model (${model})`)
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[Gemini Colors] Attempt ${attempt + 1}/${models.length} failed (${model}): ${errorMsg}`)
      if (attempt < models.length - 1) {
        console.log(`[Gemini Colors] ⚡ Falling back to ${models[attempt + 1]}...`)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Gemini Colors] All attempts failed, returning defaults')
  return getDefaultColors()
}

/**
 * Get default colors for fallback
 */
function getDefaultColors(): BrandColors {
  return {
    primary: '#111111',
    secondary: '#666666',
    accent: '#E94560',
    background: '#FFFFFF',
    text: '#111111',
    palette: ['#111111', '#666666', '#E94560', '#FFFFFF'],
    style: 'minimal',
    mood: 'מודרני ומינימליסטי'
  }
}

/**
 * Adjust color brightness
 */
export function adjustBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = (num >> 8 & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt
  
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1)
}

/**
 * Check if color is dark
 */
export function isColorDark(hex: string): boolean {
  const num = parseInt(hex.replace('#', ''), 16)
  const R = num >> 16
  const G = num >> 8 & 0x00FF
  const B = num & 0x0000FF
  const brightness = (R * 299 + G * 587 + B * 114) / 1000
  return brightness < 128
}

/**
 * Get contrasting text color
 */
export function getContrastingColor(hex: string): string {
  return isColorDark(hex) ? '#FFFFFF' : '#111111'
}


