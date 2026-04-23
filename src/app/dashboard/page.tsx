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
    <div dir="rtl" className="max-w-7xl mx-auto px-4 md:px-8 py-12 md:py-16 text-white">
      <HubRealtimeSync />

      {/* Greeting */}
      <header className="mb-16 md:mb-24">
        <p className="text-[10px] tracking-[0.5em] uppercase text-white/40 font-rubik mb-5">
          Leaders <span className="mx-1 text-white/60">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-light tracking-tight">
          שלום, <span className="font-medium">{firstName}</span>.
        </h1>
        <p className="mt-3 text-[13px] md:text-[14px] text-white/45 max-w-lg">
          בחר רובריקה כדי להתחיל, או המשך עבודה מהזנק הפעילות החי למטה.
        </p>
      </header>

      {/* Rubrics */}
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
                {!isComingSoon ? (
                  <span className="text-white/30 text-base transition-colors group-hover:text-white">
                    ←
                  </span>
                ) : (
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

      {/* Live Hub Feed */}
      <section>
        <div className="flex items-center gap-4 mb-6">
          <span className="flex items-center gap-2 text-[10px] tracking-[0.32em] uppercase text-white/60 font-rubik">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-pulse-soft" />
            האב — זמן אמת
          </span>
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-[10px] tracking-[0.24em] uppercase text-white/30 font-rubik">
            {events.length} אירועים
          </span>
        </div>

        {events.length === 0 ? (
          <p className="text-[13px] text-white/40 py-10 text-center">עדיין אין פעילות</p>
        ) : (
          <ul className="divide-y divide-white/5">
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
    <div className="flex items-center gap-4 py-4 px-2 -mx-2 rounded-sm hover:bg-white/[0.03] transition-colors">
      <span className="relative flex items-center justify-center shrink-0" aria-hidden>
        <span className={`h-2 w-2 rounded-full ${color}`} />
        {live && (
          <span className={`absolute h-2 w-2 rounded-full ${color} animate-ping opacity-60`} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-[15px] font-medium truncate">{event.title}</p>
          {event.subtitle && (
            <p className="text-[11px] text-white/50 truncate">{event.subtitle}</p>
          )}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] tracking-[0.18em] uppercase text-white/35 font-rubik">
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
      return { color: 'bg-white/60', live: false }
    case 'lead_converted':
      return { color: 'bg-brand-accent', live: false }
    case 'brief_sent':
      return { color: 'bg-brand-gold', live: false }
    case 'brief_opened':
      return { color: 'bg-white', live: false }
    case 'brief_progress':
      return { color: 'bg-brand-accent', live: true }
    case 'brief_completed':
      return { color: 'bg-brand-accent', live: false }
    case 'kickoff_editing':
      return { color: 'bg-brand-accent', live: true }
    case 'kickoff_draft':
      return { color: 'bg-white/40', live: false }
    case 'kickoff_submitted':
      return { color: 'bg-brand-accent', live: false }
    case 'document_created':
      return { color: 'bg-white/60', live: false }
    case 'document_completed':
      return { color: 'bg-brand-accent', live: false }
    default:
      return { color: 'bg-white/30', live: false }
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
