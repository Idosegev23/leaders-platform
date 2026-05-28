/**
 * POST /api/brief-note/refine
 * Polish the BD-team's free-text "personal note" that ships with a client
 * brief email. Runs Gemini Flash (matches the rest of /api/ai-assist) —
 * fast, cheap, keeps Hebrew tone steady, does NOT invent facts and does
 * NOT change the sender's intent.
 *
 * Input:  { note: string, clientName?: string, senderName?: string, language?: 'he' | 'en' }
 * Output: { refined: string }
 */

import { NextResponse } from 'next/server'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { createClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'gemini-3.5-flash'

export async function POST(request: Request) {
  if (!isDevMode) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY missing' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const note = String((body as { note?: unknown }).note || '').trim()
  if (!note) {
    return NextResponse.json({ error: 'note is empty' }, { status: 400 })
  }
  if (note.length > 2000) {
    return NextResponse.json({ error: 'note too long (max 2000 chars)' }, { status: 400 })
  }

  const clientName = String((body as { clientName?: unknown }).clientName || '').trim()
  const senderName = String((body as { senderName?: unknown }).senderName || '').trim()
  const language = (body as { language?: 'he' | 'en' }).language === 'en' ? 'en' : 'he'

  const instructions = language === 'he'
    ? `אתה עורך לשוני מקצועי בעברית עבור סוכנות Leaders.
המשימה: לעדן הודעה אישית קצרה שאיש BD כתב, שעומדת להישלח ללקוח יחד עם לינק לבריף.

חוקים:
- שמור על הכוונה המקורית ועל המידע המקורי. אל תוסיף עובדות שלא נכתבו.
- שמור על אורך דומה (לא יותר מ-20% הרחבה).
- טון: חם, ענייני, מקצועי, ללא טון מכירתי מוגזם.
- עברית תקנית, ניקוד מינימלי, ללא קלישאות, ללא אימוג'ים.
- אל תפנה ללקוח בשם פעמיים. הברכה הראשית כבר קיימת במייל ("היי {לקוח},").
- אל תחזור על שם השולח או על המילה Leaders אם הם כבר נכתבו במקור.
- ההודעה היא פסקה אחת או שתיים, ללא רשימות ובלי מספור.
- אל תשתמש בסימני ציטוט כפולים (").
- החזר רק את הטקסט המעודן — בלי הקדמות, בלי הסברים, בלי markdown.

שם הלקוח: ${clientName || '—'}
שם השולח: ${senderName || '—'}

טקסט מקורי לעידון:
---
${note}
---

הטקסט המעודן:`
    : `You are a professional English copy editor for Leaders agency.
Task: polish a short personal note that a BD person wrote, which will be sent to a client alongside a brief link.

Rules:
- Preserve the original intent and information. Do not add facts not present in the source.
- Keep length similar (no more than 20% longer).
- Tone: warm, business-like, professional. No salesy fluff.
- Standard English. No clichés. No emojis.
- Do NOT greet the client by name — the email already starts with "Hi {client},".
- Do not repeat the sender name or "Leaders" if already present in the source.
- The note is one or two short paragraphs. No bullets, no numbering.
- Do not use double quotes (").
- Return only the polished text — no preface, no explanation, no markdown.

Client name: ${clientName || '—'}
Sender name: ${senderName || '—'}

Original text to polish:
---
${note}
---

Polished text:`

  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: instructions,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    })

    let text = (response.text || '').trim()
    text = text.replace(/^"+|"+$/g, '').replace(/"/g, "'")
    // Strip an accidental leading "Polished text:" / "הטקסט המעודן:" if the
    // model echoed it. Conservative — only strip when at the very start.
    text = text.replace(/^(הטקסט המעודן:|Polished text:)\s*/i, '').trim()

    if (!text) {
      return NextResponse.json({ error: 'empty refinement' }, { status: 500 })
    }

    return NextResponse.json({ refined: text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[brief-note/refine] gemini failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
