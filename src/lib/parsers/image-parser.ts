import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3.5-flash' // Fast OCR — no need for Pro reasoning

/**
 * Parse document images (screenshots, photos of docs) using Gemini Vision OCR
 */
export async function parseImage(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
  const parserId = `img-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 🖼️ IMAGE PARSER - START`)
  console.log(`[${parserId}] 🖼️ MIME type: ${mimeType}`)
  console.log(`[${parserId}] 🖼️ Buffer size: ${buffer.length} bytes (${(buffer.length / 1024).toFixed(1)}KB)`)

  console.log(`[${parserId}] 🔄 Sending to Gemini Vision (${MODEL})...`)
  const visionStart = Date.now()

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: 'חלץ את כל הטקסט מתמונת המסמך הזו. שמור על מבנה הכותרות, פסקאות, רשימות וטבלאות. המסמך עשוי להיות בעברית. החזר את הטקסט הגולמי בלבד, ללא הערות.',
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    config: {},
  })

  const text = response.text || ''
  const visionTime = Date.now() - visionStart
  const isHebrew = detectHebrew(text)

  console.log(`[${parserId}] ✅ Vision OCR completed in ${visionTime}ms`)
  console.log(`[${parserId}] 📊 Extracted: ${text.length} chars`)
  console.log(`[${parserId}] 📊 Language: ${isHebrew ? 'Hebrew' : 'English'}`)
  console.log(`[${parserId}] 📊 First 200 chars: ${text.slice(0, 200).replace(/\n/g, ' ')}`)

  if (!text || text.length < 10) {
    console.error(`[${parserId}] ❌ Could not extract text from image (${text.length} chars)`)
    throw new Error('Could not extract text from image. Try a higher quality image.')
  }

  console.log(`[${parserId}] ⏱️ TOTAL TIME: ${Date.now() - startTime}ms`)

  return {
    text,
    metadata: {
      format: 'image-ocr',
      language: isHebrew ? 'he' : 'en',
      hasImages: true,
      hasTables: false,
    },
  }
}

function detectHebrew(text: string): boolean {
  return (text.match(/[\u0590-\u05FF]/g) || []).length > 10
}
