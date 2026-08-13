import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { callAI } from '@/lib/ai-provider'
import { getConfig } from '@/lib/config/admin-config'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import { getTemplate, type BriefFields } from '@/lib/smart-brief/templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type AssistBody = {
  templateSlug?: string
  fields?: BriefFields
  action?: 'improve' | 'gaps'
  fieldKey?: string
  instruction?: string
}

function fieldsAsText(fields: BriefFields): string {
  return Object.entries(fields)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(' | ') : v}`)
    .join('\n')
}

/**
 * POST /api/smart-brief/assist
 * action 'improve': rewrite one field ({ fieldKey, instruction? } → { value })
 * action 'gaps':    review the whole brief → { gaps: [{ key, note }] }
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as AssistBody
  const template = getTemplate(String(body.templateSlug ?? ''))
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  const fields = body.fields ?? {}
  const model = await getConfig('ai_models', 'ai_assist.model', 'gemini-3.5-flash')

  try {
    if (body.action === 'improve') {
      const field = template.fields.find((f) => f.key === body.fieldKey)
      if (!field) return NextResponse.json({ error: 'Unknown field' }, { status: 400 })
      const current = fields[field.key]
      const isList = field.type === 'list'

      const result = await callAI({
        model,
        callerId: 'smart-brief-improve',
        maxOutputTokens: 2048,
        responseSchema: {
          type: 'object',
          properties: { value: isList ? { type: 'array', items: { type: 'string' } } : { type: 'string' } },
          required: ['value'],
        },
        prompt: [
          `אתה עורך תוכן בסוכנות שיווק ישראלית. שפר את השדה "${field.label}" בתוך "${template.name}".`,
          field.aiHint ? `מה השדה צריך להכיל: ${field.aiHint}` : '',
          `הערך הנוכחי:\n${Array.isArray(current) ? current.join('\n') : current || '(ריק)'}`,
          body.instruction ? `בקשת העובד: ${body.instruction}` : 'נסח מקצועי, ממוקד ובעברית טבעית. שמור על העובדות — שפר רק את הניסוח והמבנה.',
          `הקשר — שאר הבריף:\n${fieldsAsText(fields).slice(0, 4000)}`,
        ].filter(Boolean).join('\n\n'),
      })

      const parsed = parseGeminiJson(result.text) as { value: string | string[] }
      return NextResponse.json({ value: parsed.value })
    }

    // default: gaps review
    const result = await callAI({
      model,
      callerId: 'smart-brief-gaps',
      maxOutputTokens: 2048,
      responseSchema: {
        type: 'object',
        properties: {
          gaps: {
            type: 'array',
            items: {
              type: 'object',
              properties: { key: { type: 'string' }, note: { type: 'string' } },
              required: ['key', 'note'],
            },
          },
        },
        required: ['gaps'],
      },
      prompt: [
        `אתה מנהל לקוח בכיר שמבקר "${template.name}" לפני שליחה ${template.audienceLabel}. מצא חוסרים אמיתיים בלבד — שדות ריקים, מסומנים [להשלמה], כלליים מדי או סותרים.`,
        `שדות התבנית (key: תיאור): ${template.fields.map((f) => `${f.key}: ${f.label}`).join(', ')}`,
        `הבריף הנוכחי:\n${fieldsAsText(fields).slice(0, 8000)}`,
        `החזר עד 6 חוסרים, כל אחד עם key של השדה והערה קצרה ומעשית בעברית. אם הכל תקין החזר מערך ריק.`,
      ].join('\n\n'),
    })

    const parsed = parseGeminiJson(result.text) as { gaps: Array<{ key: string; note: string }> }
    return NextResponse.json({ gaps: parsed.gaps ?? [] })
  } catch (e) {
    console.error('[smart-brief-assist] failed:', e)
    return NextResponse.json({ error: 'פעולת ה-AI נכשלה, נסה שוב' }, { status: 500 })
  }
}
