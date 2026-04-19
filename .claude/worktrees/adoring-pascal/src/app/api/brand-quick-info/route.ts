import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export const maxDuration = 300

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

const FLASH_MODEL = 'gemini-3-flash-preview'
const FALLBACK_MODEL = 'gemini-3.1-pro-preview'

export async function POST(request: NextRequest) {
  const requestId = `brand-info-${Date.now()}`
  const startTime = Date.now()
  console.log(`\n[${requestId}] 🏷️ BRAND QUICK INFO - START`)

  try {
    const { brandName } = await request.json()

    if (!brandName) {
      console.log(`[${requestId}] ⚠️ No brand name provided, returning empty`)
      return NextResponse.json({ facts: [] })
    }

    console.log(`[${requestId}] 🔍 Brand: "${brandName}"`)

    const prompt = `אתה חוקר מותגים. ספק 5 עובדות מעניינות וקצרות על המותג "${brandName}".
כל עובדה צריכה להיות משפט אחד בעברית.
התמקד ב: היסטוריה, הישגים, קהל יעד, נוכחות דיגיטלית, קמפיינים בולטים.
אם אתה לא מכיר את המותג, כתוב עובדות כלליות על התעשייה.

החזר JSON בפורמט: { "facts": ["עובדה 1", "עובדה 2", ...] }`

    // Flash first (fast + cheap), Pro fallback if overloaded
    const models = [FLASH_MODEL, FALLBACK_MODEL]
    for (let attempt = 0; attempt < models.length; attempt++) {
      const model = models[attempt]
      try {
        console.log(`[${requestId}] 🔄 Calling Gemini (${model})...`)
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        })

        const text = response.text || '{}'
        console.log(`[${requestId}] ✅ Response in ${Date.now() - startTime}ms (${model})`)

        const data = JSON.parse(text)
        console.log(`[${requestId}] 📊 Parsed ${data.facts?.length || 0} facts`)
        if (attempt > 0) console.log(`[${requestId}] ✅ Succeeded with fallback (${model})`)
        return NextResponse.json({ facts: data.facts || [] })
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`[${requestId}] Attempt ${attempt + 1}/${models.length} failed (${model}): ${msg}`)
        if (attempt < models.length - 1) {
          console.log(`[${requestId}] ⚡ Falling back to ${models[attempt + 1]}...`)
          await new Promise(r => setTimeout(r, 2000))
        }
      }
    }

    console.error(`[${requestId}] ❌ All models failed after ${Date.now() - startTime}ms`)
    return NextResponse.json({ facts: [] })
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.error(`[${requestId}] ❌ ERROR after ${elapsed}ms:`, error)
    return NextResponse.json({ facts: [] })
  }
}
