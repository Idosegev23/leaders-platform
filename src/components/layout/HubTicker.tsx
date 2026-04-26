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

  // Duplicate for smooth marquee loop
  const loop = [...items, ...items]

  return (
    <div className="sticky top-16 z-40 border-b border-brand-primary/10 bg-brand-ivory/95 backdrop-blur-sm overflow-hidden">
      <HubTickerRealtimeSync />
      <div className="relative flex items-center h-9">
        <span className="shrink-0 px-4 py-1 text-[9px] tracking-[0.36em] uppercase font-rubik text-brand-primary/55 border-e border-brand-primary/10 flex items-center gap-2">
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
    <span className="inline-flex items-center gap-2 text-[12px] text-brand-primary/75 font-rubik tracking-[0.02em] font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span className="text-brand-primary">{text}</span>
      <span className="text-brand-primary/30 text-[10px]">·</span>
      <span className="text-brand-primary/45 text-[10px] tracking-[0.16em] uppercase">
        {relativeCompact(item.created_at)}
      </span>
    </span>
  )

  if (item.href) {
    return <Link href={item.href} className="hover:text-brand-accent transition-colors">{content}</Link>
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
      return 'bg-brand-primary'
    case 'taskDeleted':
    case 'clickup_push_failed':
      return 'bg-red-600'
    case 'clickup_pushed':
      return 'bg-emerald-600'
    case 'lead_assigned':
    case 'taskAssigneeUpdated':
      return 'bg-brand-primary/55'
    default:
      return 'bg-brand-primary/35'
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
