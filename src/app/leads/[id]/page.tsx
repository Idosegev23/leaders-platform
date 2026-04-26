import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { LeadStatusControl } from '@/components/leads/LeadStatusControl'
import { LeadsRealtimeSync } from '@/components/leads/LeadsRealtimeSync'

export const dynamic = 'force-dynamic'

type Lead = {
  id: string
  name: string
  phone: string | null
  email: string | null
  website: string | null
  source: string | null
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'
  assigned_to_email: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  contacted_at: string | null
  converted_at: string | null
}

type ActivityRow = {
  id: string
  source: string
  action_type: string
  summary: string | null
  actor_name: string | null
  actor_email: string | null
  source_ref: string | null
  created_at: string
  payload: Record<string, unknown>
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const [leadRes, activityRes] = await Promise.all([
    supabase
      .from('leads')
      .select('id, name, phone, email, website, source, status, assigned_to_email, notes, metadata, created_at, updated_at, contacted_at, converted_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('activity_log')
      .select('id, source, action_type, summary, actor_name, actor_email, source_ref, created_at, payload')
      .eq('entity_type', 'lead')
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (leadRes.error || !leadRes.data) notFound()

  const lead = leadRes.data as Lead
  const activity = (activityRes.data ?? []) as ActivityRow[]
  const taskId = (lead.metadata as { task_id?: string } | null)?.task_id ?? null

  return (
    <div dir="rtl" className="max-w-5xl mx-auto px-4 md:px-8 py-10 md:py-14 text-brand-primary">
      <LeadsRealtimeSync />

      {/* Back + breadcrumb */}
      <div className="mb-10 flex items-center justify-between">
        <Link
          href="/leads"
          className="text-[12px] tracking-[0.16em] text-brand-primary/65 hover:text-brand-accent transition-colors font-rubik font-medium"
        >
          ← חזרה ללידים
        </Link>
        {taskId && (
          <a
            href={`https://app.clickup.com/t/${taskId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] tracking-[0.28em] uppercase text-brand-primary/55 hover:text-brand-accent transition-colors font-rubik font-medium flex items-center gap-2"
          >
            <span>ClickUp ↗</span>
            <span className="text-brand-primary/40 text-[10px] normal-case tracking-normal">{taskId}</span>
          </a>
        )}
      </div>

      {/* Header */}
      <header className="mb-12">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Lead · {lead.source ?? 'manual'}
        </p>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <h1 className="text-[36px] md:text-[46px] leading-[1.05] font-bold tracking-tight">
            {lead.name}
          </h1>
          <LeadStatusControl leadId={lead.id} currentStatus={lead.status} />
        </div>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-brand-primary/70">
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="hover:text-brand-accent transition-colors font-rubik tracking-[0.02em] font-medium">
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="hover:text-brand-accent transition-colors">
              {lead.email}
            </a>
          )}
          {lead.website && (
            <a
              href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand-accent transition-colors"
            >
              {lead.website.replace(/^https?:\/\//, '')}
            </a>
          )}
          {lead.assigned_to_email && (
            <span className="text-brand-primary/55 text-[11px] tracking-[0.24em] uppercase font-rubik font-medium">
              מטפל: {lead.assigned_to_email.split('@')[0]}
            </span>
          )}
        </div>
      </header>

      {lead.notes && (
        <section className="mb-12 rounded-sm ring-1 ring-brand-primary/10 bg-brand-ivory p-6">
          <p className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik mb-3 font-medium">
            הערות
          </p>
          <p className="text-[14px] text-brand-primary/80 leading-relaxed whitespace-pre-line">{lead.notes}</p>
        </section>
      )}

      {/* Meta grid */}
      <section className="mb-12 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetaCell label="נוצר" value={formatFull(lead.created_at)} />
        <MetaCell label="עודכן לאחרונה" value={formatFull(lead.updated_at)} />
        <MetaCell label="יצירת קשר" value={lead.contacted_at ? formatFull(lead.contacted_at) : '—'} />
        <MetaCell label="המרה" value={lead.converted_at ? formatFull(lead.converted_at) : '—'} />
      </section>

      {/* Timeline */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik flex items-center gap-2 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse-soft" />
            ציר זמן — כל האירועים
          </span>
          <div className="h-px flex-1 bg-brand-primary/10" />
          <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
            {activity.length} אירועים
          </span>
        </div>

        {activity.length === 0 ? (
          <p className="text-[14px] text-brand-primary/55 py-10 text-center">עדיין אין פעילות רשומה על הליד.</p>
        ) : (
          <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:start-[5px] before:w-px before:bg-brand-primary/10">
            {activity.map((a) => (
              <TimelineItem key={a.id} row={a} />
            ))}
          </ol>
        )}
      </section>
    </div>
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

function TimelineItem({ row }: { row: ActivityRow }) {
  const sourceBadge = row.source === 'clickup'
    ? { label: 'ClickUp', color: 'bg-purple-100 text-purple-700' }
    : row.source === 'leaders_ui'
    ? { label: 'פלטפורמה', color: 'bg-brand-primary/8 text-brand-primary/80' }
    : row.source === 'make'
    ? { label: 'Make', color: 'bg-amber-100 text-amber-800' }
    : { label: row.source, color: 'bg-brand-primary/8 text-brand-primary/65' }

  const dot = row.action_type.includes('status')   ? 'bg-brand-accent'
            : row.action_type.includes('created')  ? 'bg-brand-gold'
            : row.action_type.includes('failed')   ? 'bg-red-500'
            : row.action_type.includes('push')     ? 'bg-emerald-500'
            : 'bg-brand-primary/55'

  return (
    <li className="relative ps-8">
      <span className={`absolute start-[1px] top-2 h-2.5 w-2.5 rounded-full ring-2 ring-brand-pearl ${dot}`} />
      <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-brand-primary/55 font-rubik mb-1 font-medium">
        <span className={`px-2 py-0.5 rounded-sm text-[9px] normal-case tracking-[0.08em] ${sourceBadge.color}`}>
          {sourceBadge.label}
        </span>
        <span>·</span>
        <span>{formatFull(row.created_at)}</span>
      </div>
      <p className="text-[14px] text-brand-primary leading-relaxed">
        {row.summary || row.action_type}
      </p>
      {row.actor_name && (
        <p className="mt-1 text-[11px] text-brand-primary/55 font-rubik tracking-[0.02em] font-medium">
          {row.actor_name}{row.actor_email ? ` · ${row.actor_email}` : ''}
        </p>
      )}
    </li>
  )
}

function formatFull(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  return `${date} · ${time}`
}
