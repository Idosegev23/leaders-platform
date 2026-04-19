import { GoogleGenAI } from '@google/genai'
import type { ParsedDocument } from '@/types/brief'

// Polyfill DOMMatrix for Vercel serverless (pdf-parse uses it internally)
if (typeof globalThis.DOMMatrix === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    is2D = true; isIdentity = true
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const MODEL = 'gemini-3-flash-preview' // Fast OCR — no need for Pro reasoning

/**
 * Parse PDF: fast text extraction with pdf-parse → fallback to Gemini Vision for scanned/garbled PDFs.
 */
export async function parsePdf(buffer: Buffer): Promise<ParsedDocument> {
  const parserId = `pdf-${Date.now()}`
  const startTime = Date.now()
  console.log(`[${parserId}] 📄 PDF PARSER - START (${(buffer.length / 1024).toFixed(1)}KB)`)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    const pdfParse = pdfParseModule.default || pdfParseModule

    const result = await pdfParse(buffer) as { text: string; numpages: number }
    const cleanText = result.text?.trim() || ''
    const textLength = cleanText.replace(/\s/g, '').length

    console.log(`[${parserId}] pdf-parse: ${textLength} chars, ${result.numpages} pages, ${Date.now() - startTime}ms`)

    if (textLength > 100 && !isGarbled(cleanText)) {
      const isHebrew = (cleanText.match(/[\u0590-\u05FF]/g) || []).length > 10
      console.log(`[${parserId}] ✅ Good text (${isHebrew ? 'HE' : 'EN'}) — ${Date.now() - startTime}ms total`)
      return {
        text: cleanText,
        metadata: {
          pageCount: result.numpages,
          format: 'pdf',
          language: isHebrew ? 'he' : 'en',
          hasImages: false,
          hasTables: cleanText.includes('\t') || /\d+\s+\d+\s+\d+/.test(cleanText),
        },
      }
    }

    console.log(`[${parserId}] ⚠️ Low quality text (len=${textLength}, garbled=${isGarbled(cleanText)}), falling back to Vision`)
  } catch (err) {
    console.warn(`[${parserId}] pdf-parse failed: ${err instanceof Error ? err.message : err}, falling back to Vision`)
  }

  // Fallback: Gemini Vision (handles scanned PDFs, garbled Hebrew, images)
  return parsePdfWithVision(buffer, parserId, startTime)
}

async function parsePdfWithVision(buffer: Buffer, parserId: string, startTime: number): Promise<ParsedDocument> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'חלץ את כל תוכן הטקסט מהמסמך הזה. שמור על מבנה הכותרות, פסקאות, רשימות וטבלאות. המסמך עשוי להיות בעברית. החזר את הטקסט הגולמי בלבד, ללא הערות.' },
          { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
        ],
      },
    ],
    config: {},
  })

  const text = response.text || ''
  const isHebrew = (text.match(/[\u0590-\u05FF]/g) || []).length > 10
  console.log(`[${parserId}] ✅ Vision: ${text.length} chars (${isHebrew ? 'HE' : 'EN'}) — ${Date.now() - startTime}ms total`)

  return {
    text,
    metadata: { format: 'pdf-vision', language: isHebrew ? 'he' : 'en', hasImages: true, hasTables: true },
  }
}

function isGarbled(text: string): boolean {
  const total = text.replace(/\s/g, '').length
  if (total < 50) return false
  const hebrew = (text.match(/[\u0590-\u05FF]/g) || []).length
  const latin = (text.match(/[a-zA-Z]/g) || []).length
  if (hebrew === 0 && latin < total * 0.3) return true
  const special = (text.match(/[\uFFFD\uFEFF]/g) || []).length
  return special > total * 0.1
}
