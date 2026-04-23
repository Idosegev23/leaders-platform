import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { fetchTickerItems, type TickerItem } from '@/lib/hub/fetchTicker'
import { HubTickerRealtimeSync } from './HubTickerRealtimeSync'

export async function HubTicker() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const items = await fetchTickerItems(supabase, 30)
  if (items.length === 0) return null

  // Duplicate the list so the marquee loops smoothly without a visible gap.
  const loop = [...items, ...items]

  return (
    <div className="sticky top-16 z-40 border-b border-white/10 bg-[#050508] overflow-hidden">
      <HubTickerRealtimeSync />
      <div className="relative flex items-center h-9">
        <span className="shrink-0 px-4 py-1 text-[9px] tracking-[0.36em] uppercase font-rubik text-white/40 border-e border-white/10 flex items-center gap-2">
          <span className="h-1 w-1 rounded-full bg-brand-accent animate-pulse-soft" />
          Live
        </span>

        <div className="relative flex-1 overflow-hidden">
          <div className="flex items-center gap-8 whitespace-nowrap animate-ticker-marquee pause-on-hover">
            {loop.map((it, idx) => (
              <TickerCell key={`${it.id}-${idx}`} item={it} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function TickerCell({ item }: { item: TickerItem }) {
  const text = item.summary || defaultSummary(item)
  const dot = dotForAction(item.action_type)

  const content = (
    <span className="inline-flex items-center gap-2 text-[12px] text-white/70 font-rubik tracking-[0.02em]">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-white/85">{text}</span>
      <span className="text-white/30 text-[10px]">·</span>
      <span className="text-white/40 text-[10px] tracking-[0.16em] uppercase">
        {relativeCompact(item.created_at)}
      </span>
    </span>
  )

  if (item.href) {
    return <Link href={item.href} className="hover:text-white transition-colors">{content}</Link>
  }
  return <span>{content}</span>
}

function dotForAction(action: string): string {
  switch (action) {
    case 'taskStatusUpdated':
    case 'lead_status_changed':
      return 'bg-brand-accent'
    case 'taskCreated':
      return 'bg-brand-gold'
    case 'taskCommentPosted':
      return 'bg-white'
    case 'taskDeleted':
    case 'clickup_push_failed':
      return 'bg-red-500'
    case 'clickup_pushed':
      return 'bg-emerald-500'
    case 'lead_assigned':
    case 'taskAssigneeUpdated':
      return 'bg-white/70'
    default:
      return 'bg-white/40'
  }
}

function defaultSummary(item: TickerItem): string {
  return item.action_type
}

function relativeCompact(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `${mins}ד'`
  if (hours < 24) return `${hours}ש'`
  return `${days}ימ'`
}
