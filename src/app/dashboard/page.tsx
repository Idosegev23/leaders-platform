import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export const dynamic = 'force-dynamic'

type Rubric = {
  slug: string
  name: string
  english: string
  description: string
  targetUrl: string
  flowType: 'direct_form' | 'send_link' | 'coming_soon'
}

const RUBRICS: Rubric[] = [
  {
    slug: 'client-brief',
    name: 'בריף לקוח',
    english: 'Client Brief',
    description: 'שליחת טופס בריף ללקוח',
    targetUrl: '/send/client-brief',
    flowType: 'send_link',
  },
  {
    slug: 'inner-meeting',
    name: 'פגישת התנעה',
    english: 'Kick-off',
    description: 'מסמך פנימי אחרי קבלת הבריף',
    targetUrl: '/inner-meeting',
    flowType: 'direct_form',
  },
  {
    slug: 'price-quote',
    name: 'הצעת מחיר',
    english: 'Price Quote',
    description: 'טבלת שירותים ותמחור',
    targetUrl: '/price-quote',
    flowType: 'direct_form',
  },
  {
    slug: 'creative-presentation',
    name: 'מצגת קריאייטיבית',
    english: 'Creative Deck',
    description: 'הסוכן בונה הצעה מלאה מהבריף',
    targetUrl: '/create-proposal',
    flowType: 'direct_form',
  },
  {
    slug: 'summary-presentation',
    name: 'מצגת סיכום',
    english: 'Summary',
    description: 'סיכום קמפיין בסוף הפעילות',
    targetUrl: '/summary',
    flowType: 'coming_soon',
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
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()

    const { data: prof } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', authUser?.id)
      .single()
    firstName = prof?.full_name?.split(' ')[0] || authUser?.email?.split('@')[0] || 'משתמש'

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
      source: 'documents' as const,
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
    <div dir="rtl" className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16 text-white">
      {/* Greeting */}
      <header className="mb-16 md:mb-24">
        <p className="text-[10px] tracking-[0.5em] uppercase text-white/40 font-rubik mb-5">
          Leaders <span className="mx-1 text-white/60">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-light tracking-tight">
          שלום, <span className="font-medium">{firstName}</span>.
        </h1>
        <p className="mt-3 text-[13px] md:text-[14px] text-white/45 max-w-lg">
          בחר רובריקה כדי להתחיל, או המשך מסמך קיים מרשימת הפעילות.
        </p>
      </header>

      {/* Rubrics — 5 minimalist tiles */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-20 md:mb-28">
        {RUBRICS.map((r, idx) => {
          const num = String(idx + 1).padStart(2, '0')
          const isComingSoon = r.flowType === 'coming_soon'
          const inner = (
            <div
              className={`group relative h-48 md:h-56 p-6 ring-1 ring-white/10 rounded-sm bg-white/[0.02] transition-all duration-300 ${
                isComingSoon
                  ? 'opacity-40'
                  : 'hover:bg-white/[0.05] hover:ring-white/25 hover:-translate-y-[2px]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.32em] uppercase text-white/40 font-rubik">
                  {num}
                </span>
                {!isComingSoon && (
                  <span className="text-white/30 text-base transition-colors group-hover:text-white">
                    ←
                  </span>
                )}
                {isComingSoon && (
                  <span className="text-[9px] tracking-[0.32em] uppercase text-white/30 font-rubik">
                    בקרוב
                  </span>
                )}
              </div>
              <div className="absolute bottom-6 start-6 end-6">
                <p className="text-[19px] md:text-[20px] font-medium leading-tight">{r.name}</p>
                <p className="mt-1 font-cormorant italic text-[13px] text-white/45">{r.english}</p>
                <p className="mt-3 text-[11px] text-white/40 leading-relaxed line-clamp-2">
                  {r.description}
                </p>
              </div>
            </div>
          )
          return isComingSoon ? (
            <div key={r.slug} aria-disabled>
              {inner}
            </div>
          ) : (
            <Link key={r.slug} href={r.targetUrl} className="block">
              {inner}
            </Link>
          )
        })}
      </section>

      {/* Recent activity — thin list */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <span className="text-[10px] tracking-[0.32em] uppercase text-white/40 font-rubik">
            פעילות אחרונה
          </span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {recent.length === 0 ? (
          <p className="text-[13px] text-white/40 py-10 text-center">עדיין אין פעילות</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {recent.map((item) => (
              <li key={`${item.source}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between py-4 px-2 -mx-2 rounded-sm hover:bg-white/[0.03] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium truncate">{item.title}</p>
                    <p className="mt-1 text-[10px] tracking-[0.18em] uppercase text-white/40 font-rubik">
                      {item.typeLabel} · {formatDate(item.created_at)}
                    </p>
                  </div>
                  <StatusDot status={item.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    draft:     { label: 'טיוטה',   color: 'bg-white/40' },
    completed: { label: 'הושלם',   color: 'bg-brand-accent' },
    pending:   { label: 'נשלח',    color: 'bg-brand-gold' },
    opened:    { label: 'נפתח',    color: 'bg-white' },
    archived:  { label: 'בארכיון', color: 'bg-white/20' },
    generated: { label: 'מוכן',    color: 'bg-brand-accent' },
  }
  const entry = map[status] ?? { label: status, color: 'bg-white/30' }
  return (
    <span className="flex items-center gap-2 shrink-0 ms-4">
      <span className={`h-1.5 w-1.5 rounded-full ${entry.color}`} />
      <span className="text-[10px] tracking-[0.32em] uppercase text-white/50 font-rubik">
        {entry.label}
      </span>
    </span>
  )
}
