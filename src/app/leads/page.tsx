import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { LeadsRealtimeSync } from '@/components/leads/LeadsRealtimeSync'
import { LeadStatusControl } from '@/components/leads/LeadStatusControl'

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
  created_at: string
  updated_at: string
  contacted_at: string | null
  converted_at: string | null
}

const STATUS_GROUPS: Array<{
  key: Lead['status'] | 'all'
  label: string
}> = [
  { key: 'all', label: 'הכל' },
  { key: 'new', label: 'חדשים' },
  { key: 'contacted', label: 'בטיפול' },
  { key: 'qualified', label: 'מאומתים' },
  { key: 'converted', label: 'הומרו' },
  { key: 'rejected', label: 'נדחו' },
]

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status: filter } = await searchParams
  const activeFilter = (filter && STATUS_GROUPS.some((g) => g.key === filter) ? filter : 'all') as
    | Lead['status']
    | 'all'

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  let query = supabase
    .from('leads')
    .select(
      'id, name, phone, email, website, source, status, assigned_to_email, notes, created_at, updated_at, contacted_at, converted_at',
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (activeFilter !== 'all') query = query.eq('status', activeFilter)

  const { data: leads = [] } = await query

  const [counts] = await Promise.all([
    supabase
      .from('leads')
      .select('status')
      .then(({ data }) => {
        const map: Record<string, number> = { all: data?.length ?? 0 }
        for (const row of data ?? []) {
          map[row.status] = (map[row.status] ?? 0) + 1
        }
        return map
      }),
  ])

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16">
      <LeadsRealtimeSync />

      {/* Header */}
      <header className="mb-12 md:mb-16">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
        </p>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-medium tracking-tight">
            <span className="font-bold">לידים</span>
          </h1>
          <span className="text-[12px] tracking-[0.24em] uppercase text-brand-primary/55 font-rubik font-medium">
            {counts?.all ?? 0} סה״כ
          </span>
        </div>
        <p className="mt-3 text-[14px] md:text-[15px] text-brand-primary/65 max-w-lg leading-relaxed">
          כל הלידים שהתקבלו. סטטוס בלחיצה אחת. מעודכן בזמן אמת.
        </p>
      </header>

      {/* Filter chips */}
      <nav className="mb-10 flex flex-wrap gap-2 text-[12px]">
        {STATUS_GROUPS.map((g) => {
          const count = counts?.[g.key] ?? 0
          const active = g.key === activeFilter
          return (
            <a
              key={g.key}
              href={g.key === 'all' ? '/leads' : `/leads?status=${g.key}`}
              className={`px-4 py-2 rounded-full ring-1 transition-colors font-rubik tracking-[0.06em] font-medium ${
                active
                  ? 'bg-brand-primary text-brand-ivory ring-brand-primary'
                  : 'bg-brand-ivory ring-brand-primary/15 text-brand-primary/65 hover:text-brand-primary hover:ring-brand-primary/35'
              }`}
            >
              {g.label}
              <span className={`ms-2 ${active ? 'text-brand-ivory/55' : 'text-brand-primary/40'}`}>
                {count}
              </span>
            </a>
          )
        })}
      </nav>

      {/* List */}
      {leads && leads.length > 0 ? (
        <ul className="divide-y divide-brand-primary/8">
          {(leads as Lead[]).map((lead) => (
            <li key={lead.id} className="py-5">
              <LeadRow lead={lead} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-16 text-center">
          <p className="text-[14px] text-brand-primary/65">
            {activeFilter === 'all' ? 'עדיין לא הגיעו לידים.' : 'אין לידים בסטטוס הזה.'}
          </p>
          <p className="mt-2 text-[11px] text-brand-primary/45 tracking-[0.18em] uppercase font-rubik font-medium">
            Make.com ייצור כאן רשומה ברגע שיגיע ליד חדש
          </p>
        </div>
      )}
    </div>
  )
}

function LeadRow({ lead }: { lead: Lead }) {
  const dot = dotForStatus(lead.status)
  return (
    <div className="flex items-start gap-5">
      <span className="relative mt-2 shrink-0">
        <span className={`block h-2 w-2 rounded-full ${dot.color}`} />
        {lead.status === 'new' && (
          <span className={`absolute top-0 h-2 w-2 rounded-full ${dot.color} animate-ping opacity-60`} />
        )}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href={`/leads/${lead.id}`}
            className="text-[17px] md:text-[18px] font-semibold hover:text-brand-accent transition-colors"
          >
            {lead.name}
          </Link>
          <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
            {relativeTime(lead.created_at)}
            {lead.source && <> · {lead.source}</>}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-brand-primary/70">
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              className="hover:text-brand-accent transition-colors font-rubik tracking-[0.02em] font-medium"
            >
              {lead.phone}
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              className="hover:text-brand-accent transition-colors"
            >
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
        </div>

        {lead.notes && (
          <p className="mt-3 text-[13px] text-brand-primary/65 leading-relaxed max-w-2xl whitespace-pre-line">
            {lead.notes}
          </p>
        )}

        {lead.assigned_to_email && (
          <p className="mt-2 text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
            מטפל: {lead.assigned_to_email.split('@')[0]}
          </p>
        )}
      </div>

      <LeadStatusControl leadId={lead.id} currentStatus={lead.status} />
    </div>
  )
}

function dotForStatus(status: Lead['status']): { color: string } {
  switch (status) {
    case 'new':       return { color: 'bg-brand-gold' }
    case 'contacted': return { color: 'bg-brand-primary' }
    case 'qualified': return { color: 'bg-brand-primary/55' }
    case 'converted': return { color: 'bg-brand-accent' }
    case 'rejected':  return { color: 'bg-brand-primary/30' }
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `לפני ${mins} ד'`
  if (hours < 24) return `לפני ${hours} ש'`
  if (days < 7) return `לפני ${days} ימ'`
  return new Date(iso).toLocaleDateString('he-IL')
}

