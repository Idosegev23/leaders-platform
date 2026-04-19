import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'

export const maxDuration = 30

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
const FAST_MODEL = 'gemini-3-flash-preview'

export async function POST(request: NextRequest) {
  const requestId = `copilot-rewrite-${Date.now()}`

  try {
    const body = await request.json()
    const { currentText, instruction, elementRole, slideLabel, brandName } = body

    if (!currentText) {
      return NextResponse.json({ error: 'currentText is required' }, { status: 400 })
    }

    console.log(`[${requestId}] Rewriting text: role=${elementRole}, slide=${slideLabel}`)

    const roleGuidance: Record<string, string> = {
      title: 'כותרת קצרה וחזקה (3-6 מילים)',
      subtitle: 'כותרת משנית תמציתית (5-10 מילים)',
      body: 'טקסט גוף ברור ומקצועי',
      caption: 'כיתוב קצר (2-5 מילים)',
      'metric-value': 'ערך מספרי בולט',
      'metric-label': 'תווית קצרה למדד',
      'list-item': 'פריט רשימה תמציתי',
      tag: 'תגית קצרה (1-3 מילים)',
    }

    const guidance = roleGuidance[elementRole || ''] || 'טקסט מקצועי'

    const prompt = `אתה קופירייטר ישראלי מקצועי שמתמחה במצגות עסקיות.

המשימה: שכתב את הטקסט הבא בהתאם להנחיות.

טקסט נוכחי: "${currentText}"
${instruction ? `הנחיה: ${instruction}` : ''}
סוג אלמנט: ${guidance}
${slideLabel ? `שקף: ${slideLabel}` : ''}
${brandName ? `מותג: ${brandName}` : ''}

כללים:
- כתוב בעברית תקינה ומקצועית
- שמור על אורך מתאים לסוג האלמנט
- ${elementRole === 'title' ? 'כותרת חייבת להיות קצרה וחזקה' : 'שמור על טון מקצועי'}
- אל תוסיף גרשיים או סימנים מיוחדים מיותרים

החזר JSON:
{ "text": "הטקסט המשוכתב" }`

    const response = await ai.models.generateContent({
      model: FAST_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })

    const text = response.text || '{}'
    const parsed = parseGeminiJson<{ text: string }>(text)

    if (!parsed?.text) {
      throw new Error('Invalid AI response')
    }

    console.log(`[${requestId}] Rewritten: "${currentText.slice(0, 30)}..." → "${parsed.text.slice(0, 30)}..."`)

    return NextResponse.json({ success: true, text: parsed.text })
  } catch (error) {
    console.error(`[${requestId}] Error:`, error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Rewrite failed' },
      { status: 500 }
    )
  }
}
