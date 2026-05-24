'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ReminderDialog from './ReminderDialog'

export type BriefRow = {
  id: string
  token: string
  status: string
  clientName: string | null
  clientEmail: string | null
  createdByName: string | null
  createdByEmail: string | null
  createdAt: string
  openedAt: string | null
  completedAt: string | null
  outcome: 'won' | 'lost' | null
  outcomeAt: string | null
  outcomeByName: string | null
  driveFolderLink: string | null
  briefDocLink: string | null
  workspaceLink: string | null
  language: 'he' | 'en'
  reminderSentAt: string | null
  reminderCount: number
}

type Filter =
  | 'all'
  | 'needs_attention'
  | 'pending'
  | 'opened'
  | 'awaiting_outcome'
  | 'won'
  | 'lost'

type Sort = 'stale_first' | 'newest' | 'oldest'

const FILTER_OPTIONS: Array<{ key: Filter; label: string }> = [
  { key: 'needs_attention', label: 'צריך תשומת לב' },
  { key: 'all', label: 'הכל' },
  { key: 'pending', label: 'נשלח, לא נפתח' },
  { key: 'opened', label: 'במילוי' },
  { key: 'awaiting_outcome', label: 'ממתין להחלטה' },
  { key: 'won', label: 'נסגר' },
  { key: 'lost', label: 'נפל' },
]

const ATTENTION_PENDING_DAYS = 5  // pending/opened older than this → needs attention
const ATTENTION_AWAITING_DAYS = 3 // completed without outcome older than this → needs attention
const REMINDER_COOLDOWN_HOURS = 72

type ActivityEvent = {
  id: string
  action_type: string
  summary: string
  actor_name: string | null
  actor_email: string | null
  created_at: string
}

export default function BriefsList({ initialRows }: { initialRows: BriefRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = (searchParams.get('filter') as Filter) || 'needs_attention'

  const [rows, setRows] = useState<BriefRow[]>(initialRows)
  const [filter, setFilter] = useState<Filter>(initialFilter)
  const [sort, setSort] = useState<Sort>('stale_first')
  const [search, setSearch] = useState('')
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [reminderTarget, setReminderTarget] = useState<BriefRow | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activities, setActivities] = useState<Record<string, ActivityEvent[]>>({})
  const [activityLoading, setActivityLoading] = useState<Set<string>>(new Set())

  // Reflect filter in the URL so the dashboard can deep-link.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (filter === 'needs_attention') params.delete('filter')
    else params.set('filter', filter)
    const qs = params.toString()
    router.replace(qs ? `/briefs?${qs}` : '/briefs', { scroll: false })
  }, [filter, router, searchParams])

  const isNeedsAttention = (r: BriefRow): boolean => {
    if (r.outcome) return false
    const ageDays = daysSince(r.createdAt)
    if ((r.status === 'pending' || r.status === 'opened') && ageDays >= ATTENTION_PENDING_DAYS) {
      // Don't flag if a reminder was sent recently.
      if (r.reminderSentAt && hoursSince(r.reminderSentAt) < REMINDER_COOLDOWN_HOURS) return false
      return true
    }
    if (r.status === 'completed' && r.completedAt && daysSince(r.completedAt) >= ATTENTION_AWAITING_DAYS) {
      return true
    }
    return false
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = rows.filter((r) => {
      if (q) {
        const hay = [r.clientName, r.clientEmail, r.createdByName, r.createdByEmail]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      switch (filter) {
        case 'all':              return true
        case 'needs_attention':  return isNeedsAttention(r)
        case 'pending':          return !r.outcome && r.status === 'pending'
        case 'opened':           return !r.outcome && r.status === 'opened'
        case 'awaiting_outcome': return !r.outcome && r.status === 'completed'
        case 'won':              return r.outcome === 'won'
        case 'lost':             return r.outcome === 'lost'
      }
    })
    return list.sort((a, b) => {
      switch (sort) {
        case 'newest':      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'oldest':      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        case 'stale_first': {
          // Active (pending/opened/completed-no-outcome) sorted oldest first;
          // outcome'd rows sorted newest first; active always above outcome.
          const aActive = !a.outcome ? 1 : 0
          const bActive = !b.outcome ? 1 : 0
          if (aActive !== bActive) return bActive - aActive
          if (aActive) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          }
          return new Date(b.outcomeAt || b.createdAt).getTime() - new Date(a.outcomeAt || a.createdAt).getTime()
        }
      }
    })
  }, [rows, filter, search, sort])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      needs_attention: 0,
      pending: 0,
      opened: 0,
      awaiting_outcome: 0,
      won: 0,
      lost: 0,
    }
    for (const r of rows) {
      if (isNeedsAttention(r)) c.needs_attention++
      if (r.outcome === 'won') c.won++
      else if (r.outcome === 'lost') c.lost++
      else if (r.status === 'completed') c.awaiting_outcome++
      else if (r.status === 'pending') c.pending++
      else if (r.status === 'opened') c.opened++
    }
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const markOutcome = async (token: string, outcome: 'won' | 'lost') => {
    setBusyToken(token)
    setRowError(m => { const n = { ...m }; delete n[token]; return n })
    try {
      const res = await fetch(`/api/briefs/${token}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setRows(rs => rs.map(r => r.token === token ? {
        ...r,
        outcome,
        outcomeAt: new Date().toISOString(),
        workspaceLink: outcome === 'won' && data.workspace_link ? data.workspace_link : r.workspaceLink,
      } : r))
      startTransition(() => router.refresh())
    } catch (e) {
      setRowError(m => ({ ...m, [token]: e instanceof Error ? e.message : 'נכשל' }))
    } finally {
      setBusyToken(null)
    }
  }

  const onReminderSent = (token: string) => {
    const nowIso = new Date().toISOString()
    setRows(rs => rs.map(r => r.token === token ? {
      ...r,
      reminderSentAt: nowIso,
      reminderCount: r.reminderCount + 1,
    } : r))
  }

  const sendBulkReminders = async () => {
    const eligible = filtered.filter(r =>
      (r.status === 'pending' || r.status === 'opened') &&
      !r.outcome &&
      r.clientEmail &&
      (!r.reminderSentAt || hoursSince(r.reminderSentAt) >= REMINDER_COOLDOWN_HOURS)
    )
    if (eligible.length === 0) {
      setBulkResult('אין בריפים זמינים לתזכורת (כולם עברו cooldown או חסר אימייל)')
      return
    }
    if (!confirm(`לשלוח תזכורת ל-${eligible.length} בריפים?`)) return
    setBulkBusy(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/briefs/reminders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: eligible.map(r => r.token) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      // Update local rows for successful sends.
      const okTokens = new Set<string>((data.results || []).filter((r: { ok: boolean; token: string }) => r.ok).map((r: { token: string }) => r.token))
      const nowIso = new Date().toISOString()
      setRows(rs => rs.map(r => okTokens.has(r.token) ? {
        ...r,
        reminderSentAt: nowIso,
        reminderCount: r.reminderCount + 1,
      } : r))
      setBulkResult(`נשלחו ${data.sent} · דולגו (cooldown) ${data.skipped} · נכשלו ${data.failed}`)
    } catch (e) {
      setBulkResult('שליחה נכשלה: ' + (e instanceof Error ? e.message : ''))
    } finally {
      setBulkBusy(false)
    }
  }

  const toggleExpand = async (r: BriefRow) => {
    const next = new Set(expanded)
    if (next.has(r.token)) {
      next.delete(r.token)
      setExpanded(next)
      return
    }
    next.add(r.token)
    setExpanded(next)
    if (!activities[r.token] && !activityLoading.has(r.token)) {
      setActivityLoading(s => new Set(s).add(r.token))
      try {
        const res = await fetch(`/api/briefs/${r.token}/activity`)
        const data = await res.json()
        if (res.ok && Array.isArray(data.events)) {
          setActivities(a => ({ ...a, [r.token]: data.events }))
        }
      } finally {
        setActivityLoading(s => { const n = new Set(s); n.delete(r.token); return n })
      }
    }
  }

  const bulkEligibleCount = filtered.filter(r =>
    (r.status === 'pending' || r.status === 'opened') &&
    !r.outcome &&
    r.clientEmail &&
    (!r.reminderSentAt || hoursSince(r.reminderSentAt) >= REMINDER_COOLDOWN_HOURS)
  ).length

  return (
    <>
      {/* Filters + search */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.key
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`px-3 py-1.5 rounded-sm text-[12px] tracking-[0.04em] font-medium transition-colors border ${
                  active
                    ? 'bg-brand-primary text-brand-ivory border-brand-primary'
                    : 'bg-transparent text-brand-primary/70 border-brand-primary/15 hover:border-brand-primary/35'
                }`}
              >
                {opt.label}
                <span className={`mr-1.5 text-[10px] font-rubik tracking-[0.04em] ${
                  active ? 'text-brand-ivory/70' : 'text-brand-primary/45'
                }`}>
                  {counts[opt.key]}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי לקוח / שולח / אימייל"
            className="w-full px-3 py-2 rounded-sm border border-brand-primary/15 bg-white text-[13px] focus:outline-none focus:border-brand-primary/40"
          />
        </div>
      </div>

      {/* Toolbar: sort + bulk action */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap text-[12px]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/55 font-rubik font-medium">מיון</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="px-2 py-1 border border-brand-primary/15 rounded-sm bg-white text-[12px] focus:outline-none focus:border-brand-primary/40"
          >
            <option value="stale_first">פעילים תחילה (ישן→חדש)</option>
            <option value="newest">החדשים ביותר</option>
            <option value="oldest">הישנים ביותר</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          {bulkResult && (
            <span className="text-[11px] text-brand-primary/65">{bulkResult}</span>
          )}
          <button
            type="button"
            onClick={sendBulkReminders}
            disabled={bulkBusy || bulkEligibleCount === 0}
            className="px-3 py-1.5 rounded-sm border border-brand-accent/30 text-brand-accent text-[12px] font-semibold hover:bg-brand-accent/5 disabled:opacity-40 disabled:cursor-not-allowed"
            title={bulkEligibleCount === 0 ? 'אין בריפים זמינים (cooldown או חסר אימייל)' : `ישלח ל-${bulkEligibleCount} בריפים`}
          >
            {bulkBusy ? 'שולח…' : `📧 שלח תזכורת ל-${bulkEligibleCount}`}
          </button>
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-[13px] text-brand-primary/55 py-16 text-center">
          {rows.length === 0 ? 'עוד לא נשלחו בריפים' : 'אין תוצאות לסינון הזה'}
        </p>
      ) : (
        <ul className="divide-y divide-brand-primary/10">
          {filtered.map((r) => {
            const err = rowError[r.token]
            const busy = busyToken === r.token
            const cooldownLeft = r.reminderSentAt ? Math.max(0, REMINDER_COOLDOWN_HOURS - hoursSince(r.reminderSentAt)) : 0
            const canRemind = (r.status === 'pending' || r.status === 'opened') && !r.outcome && r.clientEmail && cooldownLeft === 0
            const isOpen = expanded.has(r.token)
            return (
              <li key={r.id} className="py-5 first:pt-0">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => toggleExpand(r)}
                        className="text-[16px] font-semibold hover:text-brand-accent transition-colors truncate text-right"
                        title="הצג timeline"
                      >
                        {r.clientName || '(ללא שם)'}
                      </button>
                      <BriefStatusBadge row={r} />
                      <AgeBadge createdAt={r.createdAt} outcome={r.outcome} />
                      {r.reminderCount > 0 && (
                        <span className="text-[10px] tracking-[0.16em] uppercase font-rubik font-medium text-brand-primary/55">
                          תזכורת × {r.reminderCount}
                          {r.reminderSentAt && ` · ${formatShort(r.reminderSentAt)}`}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] tracking-[0.12em] text-brand-primary/55 font-rubik font-medium">
                      <span>נשלח {formatShort(r.createdAt)}</span>
                      {r.completedAt && <span>· הוגש {formatShort(r.completedAt)}</span>}
                      {r.createdByName && <span>· {r.createdByName}</span>}
                      {r.clientEmail && (
                        <a href={`mailto:${r.clientEmail}`} className="hover:text-brand-accent transition-colors">
                          · {r.clientEmail}
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] tracking-[0.16em] uppercase font-rubik font-medium">
                      <Link href={`/briefs/${r.token}`} className="text-brand-primary/60 hover:text-brand-accent transition-colors">
                        צפה בבריף ↗
                      </Link>
                      {r.briefDocLink && (
                        <a href={r.briefDocLink} target="_blank" rel="noopener noreferrer" className="text-brand-primary/60 hover:text-brand-accent transition-colors">
                          Google Doc ↗
                        </a>
                      )}
                      {!r.briefDocLink && r.driveFolderLink && (
                        <a href={r.driveFolderLink} target="_blank" rel="noopener noreferrer" className="text-brand-primary/60 hover:text-brand-accent transition-colors">
                          תיקיית בריף (legacy) ↗
                        </a>
                      )}
                      {r.workspaceLink && (
                        <a href={r.workspaceLink} target="_blank" rel="noopener noreferrer" className="text-brand-accent/90 hover:text-brand-accent transition-colors">
                          סביבת לקוח ↗
                        </a>
                      )}
                    </div>
                    {err && (
                      <p className="mt-2 text-[12px] text-red-600">{err}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                    {canRemind && (
                      <button
                        type="button"
                        onClick={() => setReminderTarget(r)}
                        className="px-3 py-1.5 rounded-sm border border-brand-accent/30 text-brand-accent text-[12px] font-semibold hover:bg-brand-accent/5"
                      >
                        📧 תזכורת
                      </button>
                    )}
                    {!canRemind && (r.status === 'pending' || r.status === 'opened') && !r.outcome && cooldownLeft > 0 && (
                      <span className="text-[10px] tracking-[0.16em] uppercase text-brand-primary/40 font-rubik font-medium">
                        cooldown {Math.ceil(cooldownLeft)}ש'
                      </span>
                    )}
                    {r.outcome ? (
                      <span className="text-[11px] tracking-[0.16em] uppercase font-rubik font-medium text-brand-primary/55">
                        סומן ע״י {r.outcomeByName || '—'}
                      </span>
                    ) : r.status === 'completed' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => markOutcome(r.token, 'lost')}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-sm border border-brand-primary/15 text-[12px] font-medium text-brand-primary/75 hover:border-red-300 hover:text-red-600 disabled:opacity-50 transition-colors"
                        >
                          {busy ? '...' : 'סמן כנפל'}
                        </button>
                        <button
                          type="button"
                          onClick={() => markOutcome(r.token, 'won')}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-sm bg-brand-primary text-brand-ivory text-[12px] font-medium hover:bg-brand-primary/85 disabled:opacity-50 transition-colors"
                        >
                          {busy ? '...' : 'סמן כנסגר'}
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {/* Activity timeline (expanded) */}
                {isOpen && (
                  <div className="mt-4 ms-2 ps-4 border-s border-brand-primary/10">
                    {activityLoading.has(r.token) ? (
                      <p className="text-[12px] text-brand-primary/45 py-2">טוען timeline…</p>
                    ) : activities[r.token]?.length ? (
                      <ul className="space-y-2.5">
                        {activities[r.token].map(ev => (
                          <li key={ev.id} className="flex items-baseline gap-3 text-[12px]">
                            <span className="text-[10px] tracking-[0.16em] uppercase text-brand-primary/45 font-rubik font-medium min-w-[70px]">
                              {eventLabel(ev.action_type)}
                            </span>
                            <span className="flex-1 text-brand-primary/80">{ev.summary}</span>
                            <span className="text-[10px] text-brand-primary/45 font-rubik">
                              {formatShort(ev.created_at)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-brand-primary/45 py-2">אין אירועים מתועדים</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {reminderTarget && (
        <ReminderDialog
          open
          token={reminderTarget.token}
          clientName={reminderTarget.clientName || ''}
          clientEmail={reminderTarget.clientEmail}
          language={reminderTarget.language}
          daysSinceSent={Math.max(1, daysSince(reminderTarget.createdAt))}
          onClose={() => setReminderTarget(null)}
          onSent={() => onReminderSent(reminderTarget.token)}
        />
      )}
    </>
  )
}

function BriefStatusBadge({ row }: { row: BriefRow }) {
  if (row.outcome === 'won') {
    return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700">נסגר</span>
  }
  if (row.outcome === 'lost') {
    return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-red-50 text-red-600">נפל</span>
  }
  if (row.status === 'completed') {
    return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700">ממתין להחלטה</span>
  }
  if (row.status === 'opened') {
    return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-blue-50 text-blue-700">במילוי</span>
  }
  if (row.status === 'pending') {
    return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-brand-primary/8 text-brand-primary/65">נשלח</span>
  }
  return <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-brand-primary/8 text-brand-primary/55">{row.status}</span>
}

function AgeBadge({ createdAt, outcome }: { createdAt: string; outcome: 'won' | 'lost' | null }) {
  if (outcome) return null
  const days = daysSince(createdAt)
  if (days < 1) return null
  let color = 'text-brand-primary/50 bg-brand-primary/5'
  if (days >= 7) color = 'text-red-700 bg-red-50'
  else if (days >= 3) color = 'text-amber-700 bg-amber-50'
  return (
    <span className={`text-[10px] tracking-[0.04em] font-rubik font-semibold px-1.5 py-0.5 rounded-sm tabular-nums ${color}`}>
      {days}d
    </span>
  )
}

function eventLabel(action: string): string {
  switch (action) {
    case 'client_brief_sent':      return 'נשלח'
    case 'client_brief_opened':    return 'נפתח'
    case 'client_brief_completed': return 'הוגש'
    case 'client_brief_failed':    return 'נטוש'
    case 'brief_reminder_sent':    return 'תזכורת'
    case 'brief_outcome_won':      return 'נסגר'
    case 'brief_outcome_lost':     return 'נפל'
    case 'kickoff_submitted':      return 'התנעה'
    default:                       return action
  }
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000
}
function formatShort(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `לפני ${mins} ד'`
  if (hours < 24) return `לפני ${hours} ש'`
  if (days < 7) return `לפני ${days} ימ'`
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
