import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth/api-auth'
import { callAI } from '@/lib/ai-provider'
import { getConfig } from '@/lib/config/admin-config'
import { parseGeminiJson } from '@/lib/utils/json-cleanup'
import { getTemplate, type BriefFields } from '@/lib/smart-brief/templates'
import { smartBriefServiceClient, gatherClientContext } from '@/lib/smart-brief/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/smart-brief/generate
 * { templateSlug, clientName, description, materials? }
 * → { fields, contextUsed }
 *
 * Hybrid step 1: the employee describes the campaign in free text; we merge
 * that with whatever the platform already knows about the client (inner
 * meeting, completed client brief) and draft every template field.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const template = getTemplate(String(body.templateSlug ?? ''))
  if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const materials = typeof body.materials === 'string' ? body.materials.trim() : ''

  if (!description && !clientName) {
    return NextResponse.json({ error: 'צריך לפחות שם לקוח או תיאור' }, { status: 400 })
  }

  const service = smartBriefServiceClient()
  const context = clientName ? await gatherClientContext(service, clientName) : ''

  const properties: Record<string, unknown> = {}
  for (const f of template.fields) {
    properties[f.key] =
      f.type === 'list'
        ? { type: 'array', items: { type: 'string' }, description: `${f.label}. ${f.aiHint ?? ''}` }
        : { type: 'string', description: `${f.label}. ${f.aiHint ?? ''}${f.options ? ` אחת מ: ${f.options.join(' / ')}` : ''}` }
  }

  const prompt = [
    `אתה מנהל קריאייטיב בכיר בסוכנות שיווק משפיענים ישראלית (לידרס). כתוב טיוטת "${template.name}" מקצועית בעברית, מוכנה לשליחה ${template.audienceLabel}.`,
    clientName ? `הלקוח: ${clientName}` : '',
    description ? `תיאור הקמפיין מהעובד:\n${description}` : '',
    materials ? `חומרים נוספים שהעובד הדביק:\n${materials.slice(0, 8000)}` : '',
    context ? `מידע קיים במערכת על הלקוח:\n${context}` : '',
    `הנחיות:
- מלא את כל השדות. אם אין מספיק מידע לשדה — כתוב הצעה סבירה וסמן אותה בתחילית "[להשלמה]".
- כתוב בעברית טבעית ומקצועית, בגובה העיניים, בלי סופרלטיבים ריקים.
- אל תמציא עובדות על המותג שלא הופיעו בקלט.`,
  ].filter(Boolean).join('\n\n')

  try {
    const model = await getConfig('ai_models', 'ai_assist.model', 'gemini-3.5-flash')
    const result = await callAI({
      model,
      prompt,
      callerId: 'smart-brief-generate',
      maxOutputTokens: 8192,
      responseSchema: { type: 'object', properties, required: Object.keys(properties) },
    })

    const fields = parseGeminiJson(result.text) as BriefFields
    return NextResponse.json({
      fields,
      contextUsed: Boolean(context),
      provider: result.provider,
    })
  } catch (e) {
    console.error('[smart-brief-generate] failed:', e)
    return NextResponse.json({ error: 'יצירת הטיוטה נכשלה, נסה שוב' }, { status: 500 })
  }
}
