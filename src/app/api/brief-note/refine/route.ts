/**
 * POST /api/brief-note/refine
 * Polish the BD-team's free-text "personal note" that ships with a client
 * brief email. Runs Claude Haiku — fast, cheap, keeps Hebrew tone steady,
 * does NOT invent facts and does NOT change the sender's intent.
 *
 * Input:  { note: string, clientName?: string, senderName?: string, language?: 'he' | 'en' }
 * Output: { refined: string }
 */

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { isDevMode } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-haiku-4-5-20251001'

export async function POST(request: Request) {
  if (!isDevMode) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY missing' }, { status: 500 })
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

  const system = language === 'he'
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
- החזר רק את הטקסט המעודן — בלי הקדמות, בלי הסברים, בלי markdown.`
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
- Return only the polished text — no preface, no explanation, no markdown.`

  const userPrompt = language === 'he'
    ? `שם הלקוח: ${clientName || '—'}
שם השולח: ${senderName || '—'}

טקסט מקורי לעידון:
"""
${note}
"""`
    : `Client name: ${clientName || '—'}
Sender name: ${senderName || '—'}

Original text to polish:
"""
${note}
"""`

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    })

    let text = ''
    for (const block of resp.content) {
      if (block.type === 'text') text += block.text
    }
    text = text.trim().replace(/^"+|"+$/g, '').replace(/"/g, "'")

    if (!text) {
      return NextResponse.json({ error: 'empty refinement' }, { status: 500 })
    }

    return NextResponse.json({ refined: text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[brief-note/refine] claude failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
