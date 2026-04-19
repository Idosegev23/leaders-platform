import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Model: gpt-5-nano-2025-08-07 (as specified) - using Responses API
const MODEL = 'gpt-5-nano-2025-08-07'

// System prompts for different document types
export const QUOTE_SYSTEM_PROMPT = `אתה עוזר ליצירת הצעות מחיר מקצועיות בעברית.
תפקידך לאסוף מידע מהמשתמש כדי ליצור הצעת מחיר מלאה.

המידע שאתה צריך לאסוף:
1. פרטי הלקוח (שם, טלפון, אימייל - אופציונלי)
2. פרטי הספק/העסק (שם, טלפון, אימייל)
3. תוקף ההצעה
4. פריטים להצעה (שם השירות/מוצר, כמות, מחיר ליחידה)
5. האם לכלול מע"מ
6. תנאי תשלום
7. הערות נוספות (אופציונלי)

הנחיות:
- שאל שאלה אחת בכל פעם
- היה ידידותי ומקצועי
- כשיש לך את כל המידע, אמור "יש לי את כל המידע הדרוש. האם לייצר את הצעת המחיר?"
- כשהמשתמש מאשר, החזר JSON מובנה בפורמט הבא:

\`\`\`json
{
  "ready": true,
  "data": {
    "client": { "name": "", "phone": "", "email": "" },
    "supplier": { "name": "", "phone": "", "email": "" },
    "quote": {
      "validUntil": "YYYY-MM-DD",
      "vatEnabled": true,
      "paymentTerms": "",
      "items": [{ "title": "", "description": "", "qty": 1, "unitPrice": 0 }],
      "notes": ""
    }
  }
}
\`\`\``

export const DECK_SYSTEM_PROMPT = `אתה עוזר ליצירת מצגות קריאטיב מרשימות בעברית.
תפקידך לאסוף מידע מהמשתמש כדי ליצור מצגת מקצועית.

המידע שאתה צריך לאסוף:
1. נושא המצגת / כותרת ראשית
2. תת-כותרת (אופציונלי)
3. קהל היעד
4. המסר המרכזי / הרעיון הגדול
5. נקודות מפתח (3-5 נקודות)
6. סגנון עיצוב (מינימליסטי / בולט / פרימיום)
7. האם לייצר תמונות AI לשקופיות

הנחיות:
- שאל שאלה אחת בכל פעם
- היה יצירתי ומעורר השראה
- הצע רעיונות כשזה מתאים
- כשיש לך את כל המידע, אמור "יש לי את כל המידע הדרוש. האם לייצר את המצגת?"
- כשהמשתמש מאשר, החזר JSON מובנה בפורמט הבא:

\`\`\`json
{
  "ready": true,
  "data": {
    "deck": {
      "title": "",
      "subtitle": "",
      "style": "minimal",
      "slides": [
        { "type": "title", "headline": "", "subheadline": "" },
        { "type": "context", "headline": "", "content": "" },
        { "type": "audience", "headline": "", "bullets": [] },
        { "type": "big_idea", "headline": "", "content": "" },
        { "type": "image_focus", "headline": "", "images": [] },
        { "type": "summary", "headline": "", "bullets": [] }
      ]
    },
    "generateImages": true
  }
}
\`\`\``

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Using OpenAI Responses API with gpt-5-nano-2025-08-07
export async function sendChatMessage(
  messages: ChatMessage[],
  documentType: 'quote' | 'deck',
  previousResponseId?: string
): Promise<{ text: string; responseId?: string }> {
  const systemPrompt = documentType === 'quote' ? QUOTE_SYSTEM_PROMPT : DECK_SYSTEM_PROMPT

  console.log('[OpenAI Responses API] Sending request with model:', MODEL)
  console.log('[OpenAI Responses API] Previous response ID:', previousResponseId || 'none')
  console.log('[OpenAI Responses API] Messages count:', messages.length)

  try {
    // Build input for Responses API
    // If we have a previous_response_id, we only send the latest user message
    // Otherwise, we send the full conversation
    const lastUserMessage = messages[messages.length - 1]
    
    if (previousResponseId) {
      // Multi-turn with previous_response_id
      console.log('[OpenAI Responses API] Using previous_response_id for continuation')
      
      const response = await openai.responses.create({
        model: MODEL,
        input: lastUserMessage.content,
        previous_response_id: previousResponseId,
        store: true,
      })

      const text = response.output_text || ''
      console.log('[OpenAI Responses API] Response received, length:', text.length)
      
      return {
        text,
        responseId: response.id,
      }
    } else {
      // First message - send with instructions
      console.log('[OpenAI Responses API] Starting new conversation with instructions')
      
      // Build input array from messages
      const input = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

      const response = await openai.responses.create({
        model: MODEL,
        instructions: systemPrompt,
        input: input,
        store: true,
      })

      const text = response.output_text || ''
      console.log('[OpenAI Responses API] Response received, length:', text.length)
      
      return {
        text,
        responseId: response.id,
      }
    }
  } catch (error) {
    console.error('[OpenAI Responses API] Error details:', error)
    throw error
  }
}

// Parse JSON from AI response
export function parseJsonFromResponse(text: string): { ready: boolean; data?: unknown } | null {
  try {
    // Try to find JSON block in the response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }
    
    // Try to parse the whole text as JSON
    if (text.includes('"ready"')) {
      const jsonStart = text.indexOf('{')
      const jsonEnd = text.lastIndexOf('}') + 1
      if (jsonStart !== -1 && jsonEnd !== 0) {
        return JSON.parse(text.slice(jsonStart, jsonEnd))
      }
    }
    
    return null
  } catch {
    return null
  }
}
