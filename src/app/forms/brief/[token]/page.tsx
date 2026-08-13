import Image from 'next/image'
import { notFound } from 'next/navigation'
import { smartBriefServiceClient, type SmartBriefRow } from '@/lib/smart-brief/service'
import { getTemplate } from '@/lib/smart-brief/templates'

export const dynamic = 'force-dynamic'

/**
 * /forms/brief/[token] — public read-only view of a smart brief, sent to the
 * external recipient (content creator / designer). Public like the rest of
 * /forms/*. First real visit (not employee preview) stamps opened_at.
 */
export default async function PublicBriefPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { token } = await params
  const { preview } = await searchParams

  const service = smartBriefServiceClient()
  const { data } = await service.from('smart_briefs').select('*').eq('share_token', token).single()
  if (!data) notFound()

  const brief = data as SmartBriefRow
  const template = getTemplate(brief.template_slug)
  if (!template) notFound()

  // Recipients only see sent briefs; the employee preview link works always.
  const isPreview = preview === '1'
  if (brief.status !== 'sent' && !isPreview) notFound()

  if (brief.status === 'sent' && !brief.opened_at && !isPreview) {
    await service
      .from('smart_briefs')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', brief.id)
      .is('opened_at', null)
  }

  const fields = brief.fields ?? {}
  const hasValue = (v: unknown) =>
    Array.isArray(v) ? v.some((x) => String(x).trim()) : Boolean(String(v ?? '').trim())

  return (
    <div dir="rtl" className="min-h-screen bg-brand-ivory text-brand-primary">
      <div className="max-w-2xl mx-auto px-4 md:px-8 py-12 md:py-16">
        {isPreview && (
          <p className="mb-8 px-4 py-2.5 text-[12px] text-brand-primary/70 bg-brand-gold/10 ring-1 ring-brand-gold/30 rounded-sm text-center">
            תצוגה מקדימה — כך הנמען יראה את הבריף
          </p>
        )}

        <header className="mb-12 text-center">
          <div className="flex justify-center mb-6">
            <Image src="/new_logo.svg" alt="Leaders" width={150} height={45} className="object-contain" priority />
          </div>
          <p className="text-[10px] tracking-[0.4em] uppercase text-brand-primary/50 font-rubik font-medium mb-3">
            {template.english}
          </p>
          <h1 className="text-[28px] md:text-[36px] leading-tight font-bold tracking-tight">
            {template.name}
          </h1>
          {brief.client_name && (
            <p className="mt-2 text-[16px] text-brand-primary/70">{brief.client_name}</p>
          )}
        </header>

        <main className="space-y-2">
          {template.fields.map((f) => {
            const v = fields[f.key]
            const parts: React.ReactNode[] = []
            if (f.section) {
              parts.push(
                <div key={`${f.key}-section`} className="flex items-center gap-4 pt-8 pb-3">
                  <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium">
                    {f.section}
                  </span>
                  <div className="h-px flex-1 bg-brand-primary/10" />
                </div>,
              )
            }
            if (hasValue(v)) {
              parts.push(
                <div key={f.key} className="py-3">
                  <p className="text-[12px] font-medium text-brand-primary/55 mb-1.5">{f.label}</p>
                  {Array.isArray(v) ? (
                    <ul className="space-y-1.5">
                      {v.filter((x) => String(x).trim()).map((item, i) => (
                        <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed">
                          <span className="text-brand-accent shrink-0 mt-0.5">·</span>
                          <span className="whitespace-pre-wrap">{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{String(v)}</p>
                  )}
                </div>,
              )
            }
            return parts.length ? <div key={`${f.key}-wrap`}>{parts}</div> : null
          })}
        </main>

        <footer className="mt-16 pt-6 border-t border-brand-primary/10 text-center">
          <p className="text-[11px] text-brand-primary/45 font-rubik">
            נוצר במערכת Leaders OS · לשאלות פנו לאיש הקשר שבבריף
          </p>
        </footer>
      </div>
    </div>
  )
}
