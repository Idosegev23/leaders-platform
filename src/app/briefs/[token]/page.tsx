import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { formSteps } from '@/lib/client-brief/formSteps'
import { formStepsEn } from '@/lib/client-brief/formSteps.en'
import type { FormData, StepConfig } from '@/types/client-brief'

export const dynamic = 'force-dynamic'

type LinkRow = {
  id: string
  token: string
  status: 'pending' | 'opened' | 'completed' | 'failed' | 'archived' | string
  client_name: string | null
  client_email: string | null
  created_by_email: string | null
  created_by_name: string | null
  lead_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  opened_at: string | null
  completed_at: string | null
  document_types: { slug: string; name: string } | null
}

type LeadRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  metadata: Record<string, unknown> | null
}

export default async function BriefViewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const { data: linkData, error: linkErr } = await supabase
    .from('document_links')
    .select(`
      id, token, status, client_name, client_email, created_by_email, created_by_name,
      lead_id, metadata, created_at, opened_at, completed_at,
      document_types (slug, name)
    `)
    .eq('token', token)
    .maybeSingle()

  if (linkErr || !linkData) notFound()

  const link = linkData as unknown as LinkRow
  const docSlug = link.document_types?.slug ?? null
  const meta = (link.metadata as Record<string, unknown> | null) ?? {}

  const submission = (meta.submission_data as Partial<FormData> | undefined) ?? null
  const language = (meta.language as string | undefined) === 'en' ? 'en' : 'he'
  const driveFolderLink =
    (meta.workspace_drive_folder_link as string | undefined) ||
    (meta.brief_drive_folder_link as string | undefined) ||
    null
  const briefDocLink = (meta.brief_drive_doc_link as string | undefined) || null
  const submittedAt =
    (meta.submitted_at as string | undefined) || link.completed_at || null

  let lead: LeadRow | null = null
  if (link.lead_id) {
    const { data: leadData } = await supabase
      .from('leads')
      .select('id, name, email, phone, status, metadata')
      .eq('id', link.lead_id)
      .maybeSingle()
    if (leadData) lead = leadData as LeadRow
  }

  const taskId = (lead?.metadata as { task_id?: string } | null)?.task_id ?? null
  const isEnglish = language === 'en'
  const activeSteps: StepConfig[] = isEnglish ? formStepsEn : formSteps
  const isClientBrief = docSlug === 'client-brief'

  return (
    <div dir={isEnglish ? 'ltr' : 'rtl'} className="max-w-4xl mx-auto px-4 md:px-8 py-10 md:py-14 text-brand-primary">
      {/* Back row */}
      <div className="mb-10 flex items-center justify-between gap-4 flex-wrap">
        <Link
          href={lead ? `/leads/${lead.id}` : '/dashboard'}
          className="text-[12px] tracking-[0.16em] text-brand-primary/65 hover:text-brand-accent transition-colors font-rubik font-medium"
        >
          {lead ? `← ${isEnglish ? 'Back to lead' : 'חזרה לליד'}` : `← ${isEnglish ? 'Dashboard' : 'דשבורד'}`}
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          {briefDocLink && (
            <a
              href={briefDocLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tracking-[0.24em] uppercase text-brand-primary/60 hover:text-brand-accent transition-colors font-rubik font-medium"
            >
              {isEnglish ? 'Google Doc' : 'Google Doc'} ↗
            </a>
          )}
          {driveFolderLink && (
            <a
              href={driveFolderLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tracking-[0.24em] uppercase text-brand-primary/60 hover:text-brand-accent transition-colors font-rubik font-medium"
            >
              Drive ↗
            </a>
          )}
          {taskId && (
            <a
              href={`https://app.clickup.com/t/${taskId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tracking-[0.24em] uppercase text-brand-primary/60 hover:text-brand-accent transition-colors font-rubik font-medium"
            >
              ClickUp ↗
            </a>
          )}
        </div>
      </div>

      {/* Header */}
      <header className="mb-12">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          {link.document_types?.name ?? (isEnglish ? 'Brief' : 'בריף')}
          {' · '}
          <StatusLabel status={link.status} isEnglish={isEnglish} />
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-bold tracking-tight">
          {link.client_name ?? (isEnglish ? '(unnamed)' : '(ללא שם)')}
        </h1>
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-brand-primary/70">
          {link.client_email && (
            <a href={`mailto:${link.client_email}`} className="hover:text-brand-accent transition-colors">
              {link.client_email}
            </a>
          )}
          {link.created_by_name && (
            <span className="text-brand-primary/55 text-[11px] tracking-[0.24em] uppercase font-rubik font-medium">
              {isEnglish ? 'Sent by' : 'נשלח ע״י'}: {link.created_by_name}
            </span>
          )}
        </div>
      </header>

      {/* Timestamp grid */}
      <section className="mb-12 grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetaCell
          label={isEnglish ? 'Sent' : 'נשלח'}
          value={formatFull(link.created_at, isEnglish)}
        />
        <MetaCell
          label={isEnglish ? 'Opened' : 'נפתח'}
          value={link.opened_at ? formatFull(link.opened_at, isEnglish) : '—'}
        />
        <MetaCell
          label={isEnglish ? 'Submitted' : 'הוגש'}
          value={submittedAt ? formatFull(submittedAt, isEnglish) : '—'}
        />
      </section>

      {/* Submission body */}
      {!isClientBrief ? (
        <section className="rounded-sm ring-1 ring-brand-primary/10 bg-brand-ivory p-6">
          <p className="text-[14px] text-brand-primary/70">
            {isEnglish
              ? 'View not implemented yet for this document type.'
              : 'אין תצוגה ייעודית לסוג מסמך זה עדיין.'}
          </p>
        </section>
      ) : !submission ? (
        <section className="rounded-sm ring-1 ring-brand-primary/10 bg-brand-ivory p-8 text-center">
          <p className="text-[14px] text-brand-primary/70">
            {link.status === 'completed'
              ? isEnglish
                ? 'No submission data was captured for this brief.'
                : 'הבריף סומן כהושלם אך לא נשמרו תשובות.'
              : isEnglish
                ? 'The client has not submitted the brief yet.'
                : 'הלקוח עדיין לא הגיש את הבריף.'}
          </p>
        </section>
      ) : (
        <div className="space-y-10">
          {activeSteps.map((step, idx) => (
            <SectionBlock
              key={idx}
              step={step}
              data={submission}
              isEnglish={isEnglish}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionBlock({
  step,
  data,
  isEnglish,
}: {
  step: StepConfig
  data: Partial<FormData>
  isEnglish: boolean
}) {
  return (
    <section>
      <div className="flex items-center gap-4 mb-5">
        <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
          {step.title}
        </span>
        <div className="h-px flex-1 bg-brand-primary/10" />
      </div>
      <div className="rounded-sm ring-1 ring-brand-primary/10 bg-brand-ivory divide-y divide-brand-primary/8">
        {step.fields.map((field) => {
          const raw = data[field.name]
          return (
            <div key={field.name as string} className="px-5 py-4">
              <p className="text-[11px] tracking-[0.2em] uppercase text-brand-primary/55 font-rubik mb-2 font-medium">
                {field.label}
              </p>
              <FieldValue value={raw} isEnglish={isEnglish} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function FieldValue({
  value,
  isEnglish,
}: {
  value: unknown
  isEnglish: boolean
}) {
  const empty = isEnglish ? '—' : '—'
  if (value === null || value === undefined || value === '') {
    return <p className="text-[14px] text-brand-primary/40">{empty}</p>
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-[14px] text-brand-primary/40">{empty}</p>
    }
    return (
      <div className="flex flex-wrap gap-2">
        {value.map((v, i) => (
          <span
            key={`${String(v)}-${i}`}
            className="text-[12px] px-2.5 py-1 rounded-sm bg-brand-primary/8 text-brand-primary/85 font-rubik tracking-[0.02em]"
          >
            {String(v)}
          </span>
        ))}
      </div>
    )
  }
  const s = String(value)
  return (
    <p className="text-[14px] text-brand-primary/85 leading-relaxed whitespace-pre-line">
      {s}
    </p>
  )
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm ring-1 ring-brand-primary/10 p-4 bg-brand-ivory">
      <p className="text-[9px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik mb-2 font-medium">{label}</p>
      <p className="text-[13px] text-brand-primary font-rubik tracking-[0.02em] font-medium">{value}</p>
    </div>
  )
}

function StatusLabel({ status, isEnglish }: { status: string; isEnglish: boolean }) {
  const map: Record<string, { he: string; en: string; cls: string }> = {
    pending:   { he: 'ממתין', en: 'Pending', cls: 'text-brand-primary/55' },
    opened:    { he: 'נפתח', en: 'Opened', cls: 'text-amber-600' },
    completed: { he: 'הושלם', en: 'Completed', cls: 'text-emerald-600' },
    failed:    { he: 'נטוש', en: 'Abandoned', cls: 'text-red-500' },
    archived:  { he: 'בארכיון', en: 'Archived', cls: 'text-brand-primary/45' },
  }
  const m = map[status] ?? { he: status, en: status, cls: 'text-brand-primary/55' }
  return <span className={m.cls}>{isEnglish ? m.en : m.he}</span>
}

function formatFull(iso: string, isEnglish: boolean): string {
  const d = new Date(iso)
  const locale = isEnglish ? 'en-US' : 'he-IL'
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}
