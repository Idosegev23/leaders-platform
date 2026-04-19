import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { formatDate } from '@/lib/utils'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'

type Rubric = {
  slug: string
  name: string
  description: string
  targetUrl: string
  gradient: string
  flowType: 'direct_form' | 'send_link' | 'coming_soon'
  icon: React.ReactNode
}

const BriefIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
)
const MeetingIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-10a4 4 0 110 8 4 4 0 010-8zm6 4a3 3 0 110 6 3 3 0 010-6zM5 11a3 3 0 110 6 3 3 0 010-6z" />
  </svg>
)
const QuoteIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9-4 9 4M3 8v10l9 4 9-4V8M3 8l9 4m0 0l9-4m-9 4v10" />
  </svg>
)
const PresentationIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M5 4v11a2 2 0 002 2h10a2 2 0 002-2V4M9 21l3-4 3 4" />
  </svg>
)
const SummaryIcon = (
  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2a2 2 0 012-2h2a2 2 0 012 2v2M7 7h10M7 11h4m-1 10h6a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
)

const RUBRICS: Rubric[] = [
  {
    slug: 'client-brief',
    name: 'בריף לקוח',
    description: 'שליחת טופס בריף ללקוח ומעקב אחרי המילוי',
    targetUrl: '/send/client-brief',
    flowType: 'send_link',
    gradient: 'from-rose-900 to-red-800 hover:from-rose-800 hover:to-red-700',
    icon: BriefIcon,
  },
  {
    slug: 'inner-meeting',
    name: 'פגישת התנעה',
    description: 'מסמך התנעה פנימי לאחר קבלת הבריף מהלקוח',
    targetUrl: '/inner-meeting',
    flowType: 'direct_form',
    gradient: 'from-amber-900 to-orange-800 hover:from-amber-800 hover:to-orange-700',
    icon: MeetingIcon,
  },
  {
    slug: 'price-quote',
    name: 'הצעת מחיר',
    description: 'יצירת הצעת מחיר עם טבלת שירותים ותמחור',
    targetUrl: '/price-quote',
    flowType: 'direct_form',
    gradient: 'from-emerald-900 to-teal-800 hover:from-emerald-800 hover:to-teal-700',
    icon: QuoteIcon,
  },
  {
    slug: 'creative-presentation',
    name: 'מצגת קריאייטיבית',
    description: 'הסוכן בונה הצעה מלאה ומצגת מהבריף',
    targetUrl: '/create-proposal',
    flowType: 'direct_form',
    gradient: 'from-indigo-900 to-purple-800 hover:from-indigo-800 hover:to-purple-700',
    icon: PresentationIcon,
  },
  {
    slug: 'summary-presentation',
    name: 'מצגת סיכום',
    description: 'סיכום קמפיין בסוף הפעילות',
    targetUrl: '/summary',
    flowType: 'coming_soon',
    gradient: 'from-slate-800 to-slate-700',
    icon: SummaryIcon,
  },
]

type RecentItem = {
  id: string
  title: string
  source: 'document_links' | 'documents'
  status: string
  created_at: string
  href: string
  typeLabel: string
}

export default async function DashboardPage() {
  let firstName = 'משתמש'
  let recent: RecentItem[] = []

  if (isDevMode) {
    firstName = DEV_USER.full_name?.split(' ')[0] || 'משתמש'
  } else {
    const supabase = await createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()

    // Profile (pptmaker's users table — name/avatar)
    const { data: prof } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', authUser?.id)
      .single()
    firstName = prof?.full_name?.split(' ')[0] || authUser?.email?.split('@')[0] || 'משתמש'

    // Unified recent activity: merge pptmaker's `documents` with hub's `document_links`.
    // Both queries are best-effort — a missing table (migration not yet run) should not
    // blow up the dashboard.
    const [docsRes, linksRes] = await Promise.all([
      supabase
        .from('documents')
        .select('id, title, type, status, created_at')
        .eq('user_id', authUser?.id)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('document_links')
        .select('id, token, status, client_name, created_at, document_types(slug, name, target_url)')
        .eq('created_by_email', authUser?.email ?? '')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const docsItems: RecentItem[] = (docsRes.data ?? []).map((d) => ({
      id: d.id,
      title: d.title || '(ללא שם)',
      source: 'documents',
      status: d.status ?? 'draft',
      created_at: d.created_at,
      href: d.type === 'quote' ? `/price-quote?id=${d.id}` : `/edit/${d.id}`,
      typeLabel: d.type === 'quote' ? 'הצעת מחיר' : 'מצגת קריאייטיבית',
    }))

    const linksItems: RecentItem[] = (linksRes.data ?? []).map((l) => {
      const dt = (l as unknown as { document_types?: { slug: string; name: string; target_url: string } }).document_types
      return {
        id: l.id,
        title: l.client_name || dt?.name || 'לינק',
        source: 'document_links' as const,
        status: l.status ?? 'pending',
        created_at: l.created_at,
        href: dt?.target_url ? `${dt.target_url}?token=${l.token}` : '/dashboard',
        typeLabel: dt?.name ?? 'מסמך',
      }
    })

    recent = [...docsItems, ...linksItems]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-10">
        <p className="text-sm text-muted-foreground mb-1">Leaders Platform</p>
        <h1 className="text-3xl font-bold mb-1">שלום, {firstName}</h1>
        <p className="text-muted-foreground">בחר רובריקה כדי ליצור מסמך חדש, או המשך מסמך קיים למטה</p>
      </div>

      {/* Rubrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {RUBRICS.map((r) => {
          const isComingSoon = r.flowType === 'coming_soon'
          const card = (
            <div
              className={`relative p-6 h-full rounded-xl border-0 text-white bg-gradient-to-l ${r.gradient} transition-all duration-300 ${
                isComingSoon
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer group-hover:-translate-y-1 group-hover:shadow-xl'
              }`}
            >
              {isComingSoon && (
                <span className="absolute top-3 left-3 text-[10px] tracking-[0.2em] uppercase px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  בבנייה
                </span>
              )}
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-white/10 shrink-0">{r.icon}</div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold mb-1">{r.name}</h3>
                  <p className="text-white/70 text-sm leading-relaxed">{r.description}</p>
                </div>
                {!isComingSoon && (
                  <span className="text-white/60 group-hover:text-white text-lg shrink-0">&larr;</span>
                )}
              </div>
            </div>
          )
          return isComingSoon ? (
            <div key={r.slug} className="group block" aria-disabled>
              {card}
            </div>
          ) : (
            <Link key={r.slug} href={r.targetUrl} className="group block">
              {card}
            </Link>
          )
        })}
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader>
          <CardTitle>פעילות אחרונה</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length > 0 ? (
            <div className="space-y-1">
              {recent.map((item) => (
                <Link
                  key={`${item.source}-${item.id}`}
                  href={item.href}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                      {item.title.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{item.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.typeLabel} · {formatDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={item.status} source={item.source} />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-10 text-sm">עדיין אין פעילות</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status, source }: { status: string; source: RecentItem['source'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: 'טיוטה', cls: 'bg-slate-100 text-slate-700' },
    completed: { label: 'הושלם', cls: 'bg-green-100 text-green-700' },
    archived: { label: 'בארכיון', cls: 'bg-zinc-100 text-zinc-600' },
    pending: { label: 'נשלח', cls: 'bg-amber-100 text-amber-700' },
    opened: { label: 'נפתח', cls: 'bg-blue-100 text-blue-700' },
    generated: { label: 'מוכן', cls: 'bg-emerald-100 text-emerald-700' },
  }
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  const suffix = source === 'document_links' ? ' · לינק' : ''
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${entry.cls}`}>
      {entry.label}
      {suffix}
    </span>
  )
}
