import { createClient } from '@supabase/supabase-js'

export function smartBriefServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export type SmartBriefRow = {
  id: string
  template_slug: string
  title: string | null
  client_name: string | null
  client_folder_id: string | null
  status: 'draft' | 'sent'
  fields: Record<string, string | string[]>
  ai_meta: Record<string, unknown>
  share_token: string
  created_by_email: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  opened_at: string | null
}

/**
 * אוסף כל מה שהמערכת כבר יודעת על הלקוח — פגישת ההתנעה ותשובות בריף
 * הלקוח — לטקסט הקשר שמוזן ל-AI. כל מקור עטוף ב-try/catch: הקשר חסר
 * עדיף על כישלון.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function gatherClientContext(service: any, clientName: string): Promise<string> {
  const parts: string[] = []
  const name = clientName.trim()
  if (!name) return ''

  try {
    const { data: meetings } = await service
      .from('inner_meeting_forms')
      .select('client_name, about_brand, target_audiences, goals, insight, strategy, creative, media_strategy, additional_notes, updated_at')
      .ilike('client_name', `%${name}%`)
      .order('updated_at', { ascending: false })
      .limit(1)
    const m = meetings?.[0]
    if (m) {
      const fields: Array<[string, string | null]> = [
        ['על המותג', m.about_brand],
        ['קהלי יעד', m.target_audiences],
        ['מטרות', m.goals],
        ['תובנה', m.insight],
        ['אסטרטגיה', m.strategy],
        ['קריאייטיב', m.creative],
        ['אסטרטגיית מדיה', m.media_strategy],
        ['הערות', m.additional_notes],
      ]
      const body = fields
        .filter(([, v]) => v && v.trim())
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      if (body) parts.push(`## פגישת ההתנעה הפנימית של "${m.client_name}"\n${body}`)
    }
  } catch { /* context is best-effort */ }

  try {
    const { data: links } = await service
      .from('document_links')
      .select('client_name, status, metadata, completed_at')
      .ilike('client_name', `%${name}%`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1)
    const l = links?.[0]
    if (l?.metadata) {
      const json = JSON.stringify(l.metadata, null, 1)
      parts.push(`## בריף הלקוח שמולא ע"י "${l.client_name}" (JSON)\n${json.slice(0, 6000)}`)
    }
  } catch { /* context is best-effort */ }

  return parts.join('\n\n')
}
