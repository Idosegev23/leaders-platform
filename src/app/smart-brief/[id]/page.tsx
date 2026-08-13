import { notFound } from 'next/navigation'
import { smartBriefServiceClient, type SmartBriefRow } from '@/lib/smart-brief/service'
import { getTemplate } from '@/lib/smart-brief/templates'
import BriefEditor from './BriefEditor'

export const dynamic = 'force-dynamic'

export default async function SmartBriefEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const service = smartBriefServiceClient()
  const { data } = await service.from('smart_briefs').select('*').eq('id', id).single()
  if (!data) notFound()

  const brief = data as SmartBriefRow
  const template = getTemplate(brief.template_slug)
  if (!template) notFound()

  return <BriefEditor brief={brief} template={template} />
}
