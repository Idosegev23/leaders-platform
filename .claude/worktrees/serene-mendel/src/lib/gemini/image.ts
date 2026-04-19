/**
 * Gemini Image Generation Service
 * Uses Nano Banana Pro (gemini-3-pro-image-preview) for high-fidelity image generation,
 * with optional Gemini 3.1 Pro Search Grounding for real-time data visualization.
 */

import { GoogleGenAI } from '@google/genai'

// Initialize the Google GenAI client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

// Models setup
const IMAGE_MODEL = 'gemini-3-pro-image-preview' // The multimodal image generation model
const FLASH_TEXT_MODEL = 'gemini-3-flash-preview' // Primary for text/grounding — fast + cheap
const PRO_TEXT_MODEL = 'gemini-3.1-pro-preview'   // Fallback when Flash fails

export interface GeneratedImage {
  base64: string
  mimeType: string
  prompt: string
}

export interface ImageGenerationOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  imageSize?: '2K' | '4K'
  useGoogleSearch?: boolean
}

/**
 * Generate an image using the Gemini 3 Pro Image Preview model
 */
export async function generateImage(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<GeneratedImage | null> {
  const { 
    aspectRatio = '16:9',
    imageSize = '4K',
    useGoogleSearch = false 
  } = options

  try {
    let finalPrompt = prompt;

    // If Google Search is requested, we use the Text model to fetch data and write the visual prompt
    if (useGoogleSearch) {
      console.log(`[Gemini Image] Using Search Grounding to enhance prompt...`);
      finalPrompt = await createGroundedVisualPrompt(prompt);
      console.log(`[Gemini Image] Grounded Prompt: ${finalPrompt}`);
    } else {
      console.log(`[Gemini Image] Generating image...`);
    }

    const config: any = {
      responseModalities: ['image', 'text'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: imageSize
      }
    }

    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: finalPrompt,
      config: config,
    })

    // Extract image from response
    const candidates = response.candidates || []
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || []
      for (const part of parts) {
        if (part.inlineData) {
          console.log(`[Gemini Image] Successfully generated image.`);
          return {
            base64: part.inlineData.data || '',
            mimeType: part.inlineData.mimeType || 'image/jpeg',
            prompt: finalPrompt,
          }
        }
      }
    }

    throw new Error('No image returned from the API')
  } catch (error) {
    console.error('[Gemini Image] Error generating image:', error)
    return null
  }
}

/**
 * Helper: Uses Gemini 3.1 Pro with Google Search to fetch real-time info 
 * and convert it into a highly detailed text-to-image prompt.
 */
async function createGroundedVisualPrompt(userPrompt: string): Promise<string> {
  const groundingPrompt = `
You are an expert AI prompt engineer and data visualizer.
The user wants an image based on this request: "${userPrompt}"

Instructions:
1. Use Google Search to find the most up-to-date and accurate information related to this request (e.g., current statistics, weather, news, or brand details).
2. Based on the real-time facts you found, write a highly descriptive, visual text-to-image prompt IN ENGLISH.
3. The prompt must describe exactly what should be drawn to represent this data visually (e.g., "A modern infographic showing...", "A realistic photo of...", etc.).
4. Add professional photography or design modifiers (e.g., "8k resolution, highly detailed, cinematic lighting, corporate style").
5. RETURN ONLY THE ENGLISH PROMPT. Do not include any intro, outro, or markdown blocks.
  `;

  // Flash first (fast + cheap for grounding), Pro fallback
  const models = [FLASH_TEXT_MODEL, PRO_TEXT_MODEL]
  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt]
    try {
      const response = await ai.models.generateContent({
        model,
        contents: groundingPrompt,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });

      const text = response.text?.trim()
      if (text) {
        if (attempt > 0) console.log(`[Gemini Image] ✅ Grounding succeeded with fallback (${model})`)
        return text
      }
      throw new Error('Empty grounding response')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`[Gemini Image] Grounding attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
      if (attempt < models.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  console.error('[Gemini Image] All grounding attempts failed, using original prompt')
  return `Professional high quality image of: ${userPrompt}`;
}

/**
 * Generate image directly with Google Search grounding 
 * (Syntactic sugar wrapper)
 */
export async function generateGroundedImage(prompt: string): Promise<GeneratedImage | null> {
  return generateImage(prompt, {
    aspectRatio: '16:9',
    useGoogleSearch: true,
  })
}

/**
 * Generate multiple images in parallel
 */
export async function generateImages(
  prompts: string[],
  options: ImageGenerationOptions = {}
): Promise<(GeneratedImage | null)[]> {
  console.log(`[Gemini Image] Generating ${prompts.length} images in parallel...`)
  const results = await Promise.all(
    prompts.map(prompt => generateImage(prompt, options))
  )
  return results
}

/**
 * Generate highly-optimized image prompts for deck slides
 * Enhanced with professional photography and design keywords for the new model
 */
export function generateSlideImagePrompts(
  deckTitle: string, 
  slides: Array<{ type: string; headline?: string; content?: string }>
): string[] {
  // Base style modifiers to ensure consistent, high-end corporate quality
  const styleModifiers = "professional corporate photography, 8k resolution, photorealistic, cinematic lighting, clean composition, high-end editorial style";
  const graphicModifiers = "modern minimal abstract background, elegant corporate design, smooth gradients, 4k, high quality";

  return slides
    .filter(slide => ['title', 'image_focus', 'big_idea'].includes(slide.type))
    .map(slide => {
      switch (slide.type) {
        case 'title':
          return `An impressive, abstract modern background for a presentation titled "${deckTitle}". Warm corporate colors, no text, ${graphicModifiers}.`
        case 'image_focus':
          return `A striking and highly detailed photograph representing the concept of: "${slide.headline || deckTitle}". Strong visual center, ${styleModifiers}.`
        case 'big_idea':
          return `An inspiring, conceptual and artistic image representing the innovative idea: "${slide.headline || slide.content || 'new innovation'}". Unique perspective, awe-inspiring, ${styleModifiers}.`
        default:
          return `A professional image illustrating the topic: "${slide.headline || deckTitle}". ${styleModifiers}.`
      }
    })
}