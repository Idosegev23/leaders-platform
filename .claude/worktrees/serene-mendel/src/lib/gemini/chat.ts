import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

const CHAT_MODEL = 'gemini-2.0-flash'
const CHAT_CONFIG = {
  temperature: 0.7,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 2048,
}

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
  role: 'user' | 'model'
  parts: { text: string }[]
}

export async function startChat(documentType: 'quote' | 'deck') {
  const systemPrompt = documentType === 'quote' ? QUOTE_SYSTEM_PROMPT : DECK_SYSTEM_PROMPT

  const chat = ai.chats.create({
    model: CHAT_MODEL,
    config: {
      systemInstruction: systemPrompt,
      ...CHAT_CONFIG,
    },
    history: [
      {
        role: 'model',
        parts: [{ text: 'הבנתי. אני מוכן לעזור ליצור ' + (documentType === 'quote' ? 'הצעת מחיר' : 'מצגת קריאטיב') + '. בוא נתחיל!' }],
      },
    ],
  })

  return chat
}

export async function sendMessage(chat: Awaited<ReturnType<typeof startChat>>, message: string) {
  const response = await chat.sendMessage({ message })
  return response.text || ''
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





