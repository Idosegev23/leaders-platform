import Link from 'next/link'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'
import { fetchHubFeed } from '@/lib/hub/fetchFeed'
import type { HubEvent, HubEventKind } from '@/lib/hub/types'
import { HubRealtimeSync } from '@/components/dashboard/HubRealtimeSync'

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

export default async function DashboardPage() {
  let firstName = 'משתמש'

  if (isDevMode) {
    firstName = DEV_USER.full_name?.split(' ')[0] || 'משתמש'
  } else {
    const supabase = await createServerClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    const { data: prof } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', authUser?.id)
      .single()
    firstName = prof?.full_name?.split(' ')[0] || authUser?.email?.split('@')[0] || 'משתמש'
  }

  // Service-role client for the feed — RLS on `documents`/`users` would hide
  // peers' work, and the hub is explicitly global.
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  const events = await fetchHubFeed(serviceClient, 30)

  return (
    <div dir="rtl" className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16 text-brand-primary">
      <HubRealtimeSync />

      {/* Greeting */}
      <header className="mb-16 md:mb-24">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-medium tracking-tight">
          שלום, <span className="font-bold">{firstName}</span>.
        </h1>
        <p className="mt-3 text-[14px] md:text-[15px] text-brand-primary/65 max-w-lg leading-relaxed">
          בחר רובריקה כדי להתחיל, או המשך עבודה מפיד הפעילות החי למטה.
        </p>
      </header>

      {/* Rubrics */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-20 md:mb-28">
        {RUBRICS.map((r, idx) => {
          const num = String(idx + 1).padStart(2, '0')
          const isComingSoon = r.flowType === 'coming_soon'
          const inner = (
            <div
              className={`group relative h-48 md:h-56 p-6 ring-1 ring-brand-primary/10 rounded-sm bg-brand-ivory transition-all duration-300 ${
                isComingSoon
                  ? 'opacity-50'
                  : 'hover:ring-brand-primary/25 hover:-translate-y-[2px] hover:shadow-[0_12px_28px_-18px_rgba(26,26,46,0.18)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium">
                  {num}
                </span>
                {!isComingSoon ? (
                  <span className="text-brand-primary/35 text-base transition-colors group-hover:text-brand-accent">
                    ←
                  </span>
                ) : (
                  <span className="text-[9px] tracking-[0.32em] uppercase text-brand-primary/45 font-rubik font-medium">
                    בקרוב
                  </span>
                )}
              </div>
              <div className="absolute bottom-6 start-6 end-6">
                <p className="text-[19px] md:text-[20px] font-semibold leading-tight">{r.name}</p>
                <p className="mt-1 text-[11px] text-brand-primary/55 font-rubik tracking-[0.04em] uppercase font-medium">
                  {r.english}
                </p>
                <p className="mt-3 text-[12px] text-brand-primary/65 leading-relaxed line-clamp-2">
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

      {/* Live Hub Feed */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <span className="flex items-center gap-2 text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse-soft" />
            האב — זמן אמת
          </span>
          <div className="h-px flex-1 bg-brand-primary/10" />
          <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium">
            {events.length} אירועים
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-[13px] text-brand-primary/55 py-10 text-center">עדיין אין פעילות</p>
        ) : (
          <ul className="divide-y divide-brand-primary/8">
            {events.map((e) => (
              <li key={e.id}>
                <HubEventRow event={e} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/* --------------------------------------------------------- */
/* Event row                                                  */
/* --------------------------------------------------------- */

function HubEventRow({ event }: { event: HubEvent }) {
  const { color, live } = dotStyle(event.kind)
  const whoDisplay = event.actor_name || event.actor_email?.split('@')[0] || null

  const content = (
    <div className="flex items-center gap-4 py-4 px-2 -mx-2 rounded-sm hover:bg-brand-primary/[0.03] transition-colors">
      <span className="relative flex items-center justify-center shrink-0" aria-hidden>
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {live && (
          <span className={`absolute h-2 w-2 rounded-full ${color} animate-ping opacity-60`} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[15px] font-semibold truncate">{event.title}</p>
          {event.subtitle && (
            <p className="text-[12px] text-brand-primary/65 truncate">{event.subtitle}</p>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] tracking-[0.18em] uppercase text-brand-primary/45 font-rubik font-medium">
          <span>{eventLabel(event.kind)}</span>
          {whoDisplay && <span>· {whoDisplay}</span>}
          <span>· {relativeTime(event.timestamp)}</span>
        </div>
      </div>
    </div>
  )

  return event.href ? <Link href={event.href} className="block">{content}</Link> : <div>{content}</div>
}

function dotStyle(kind: HubEventKind): { color: string; live: boolean } {
  switch (kind) {
    case 'lead_new':
      return { color: 'bg-brand-gold', live: true }
    case 'lead_contacted':
      return { color: 'bg-brand-primary/55', live: false }
    case 'lead_converted':
      return { color: 'bg-brand-accent', live: false }
    case 'brief_sent':
      return { color: 'bg-brand-gold', live: false }
    case 'brief_opened':
      return { color: 'bg-brand-primary', live: false }
    case 'brief_progress':
      return { color: 'bg-brand-accent', live: true }
    case 'brief_completed':
      return { color: 'bg-brand-accent', live: false }
    case 'kickoff_editing':
      return { color: 'bg-brand-accent', live: true }
    case 'kickoff_draft':
      return { color: 'bg-brand-primary/35', live: false }
    case 'kickoff_submitted':
      return { color: 'bg-brand-accent', live: false }
    case 'document_created':
      return { color: 'bg-brand-primary/55', live: false }
    case 'document_completed':
      return { color: 'bg-brand-accent', live: false }
    default:
      return { color: 'bg-brand-primary/30', live: false }
  }
}

function eventLabel(kind: HubEventKind): string {
  switch (kind) {
    case 'lead_new':           return 'ליד חדש'
    case 'lead_contacted':     return 'ליד בטיפול'
    case 'lead_converted':     return 'ליד הומר'
    case 'brief_sent':         return 'בריף נשלח'
    case 'brief_opened':       return 'בריף נפתח'
    case 'brief_progress':     return 'בריף במילוי'
    case 'brief_completed':    return 'בריף הושלם'
    case 'kickoff_draft':      return 'פגישת התנעה'
    case 'kickoff_editing':    return 'פגישה בעריכה'
    case 'kickoff_submitted':  return 'פגישה הושלמה'
    case 'document_created':   return 'מסמך נוצר'
    case 'document_completed': return 'מסמך הושלם'
    default:                   return ''
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
