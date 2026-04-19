import { NextRequest, NextResponse } from 'next/server'
import { ThinkingLevel } from '@google/genai'
import { callAI } from '@/lib/ai-provider'

export const maxDuration = 60

const MODE_PROMPTS: Record<string, string> = {
  shorter: 'קצר את הטקסט הבא לחצי, שמור על המשמעות והטון. החזר רק את הטקסט החדש בעברית, ללא הסברים.',
  dramatic: 'שכתב את הטקסט בטון דרמטי וחד יותר, מתאים לפיץ\' פרזנטציה. שמור על הקיצור. עברית בלבד, רק הטקסט החדש.',
  formal: 'שכתב את הטקסט בטון פורמלי ומקצועי, מתאים למצגת B2B. עברית בלבד, רק הטקסט החדש.',
}

export async function POST(req: NextRequest) {
  try {
    const { text, mode, context } = await req.json()
    if (!text || !MODE_PROMPTS[mode]) {
      return NextResponse.json({ error: 'text + valid mode required' }, { status: 400 })
    }

    const ctx = context as { slideType?: string; field?: string } | undefined
    const prompt = `${MODE_PROMPTS[mode]}\n\nשדה: ${ctx?.field || ''} | סוג שקף: ${ctx?.slideType || ''}\n\nהטקסט המקורי:\n"""\n${text}\n"""\n\nהטקסט החדש:`

    const result = await callAI({
      model: 'gemini-3-flash-preview',
      prompt,
      callerId: 'gamma-rewrite',
      maxOutputTokens: 1000,
      geminiConfig: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, temperature: 0.8 },
    })

    const cleaned = result.text.trim().replace(/^["'\s]+|["'\s]+$/g, '')
    return NextResponse.json({ text: cleaned })
  } catch (err) {
    console.error('[gamma-rewrite] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
