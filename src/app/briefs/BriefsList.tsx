'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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
}

type Filter = 'all' | 'in_progress' | 'awaiting_outcome' | 'won' | 'lost'

const FILTER_OPTIONS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'in_progress', label: 'בתהליך' },
  { key: 'awaiting_outcome', label: 'ממתין להחלטה' },
  { key: 'won', label: 'נסגר' },
  { key: 'lost', label: 'נפל' },
]

export default function BriefsList({ initialRows }: { initialRows: BriefRow[] }) {
  const router = useRouter()
  const [rows, setRows] = useState<BriefRow[]>(initialRows)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [busyToken, setBusyToken] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [errorByToken, setErrorByToken] = useState<Record<string, string>>({})

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (q) {
        const hay = [r.clientName, r.clientEmail, r.createdByName, r.createdByEmail]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      switch (filter) {
        case 'all':
          return true
        case 'in_progress':
          return !r.outcome && (r.status === 'pending' || r.status === 'opened')
        case 'awaiting_outcome':
          return !r.outcome && r.status === 'completed'
        case 'won':
          return r.outcome === 'won'
        case 'lost':
          return r.outcome === 'lost'
      }
    })
  }, [rows, filter, search])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      in_progress: 0,
      awaiting_outcome: 0,
      won: 0,
      lost: 0,
    }
    for (const r of rows) {
      if (r.outcome === 'won') c.won++
      else if (r.outcome === 'lost') c.lost++
      else if (r.status === 'completed') c.awaiting_outcome++
      else if (r.status === 'pending' || r.status === 'opened') c.in_progress++
    }
    return c
  }, [rows])

  const markOutcome = async (token: string, outcome: 'won' | 'lost') => {
    setBusyToken(token)
    setErrorByToken((m) => {
      const next = { ...m }
      delete next[token]
      return next
    })
    try {
      const res = await fetch(`/api/briefs/${token}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setRows((rs) =>
        rs.map((r) =>
          r.token === token
            ? {
                ...r,
                outcome,
                outcomeAt: new Date().toISOString(),
                workspaceLink:
                  outcome === 'won' && data.workspace_link ? data.workspace_link : r.workspaceLink,
              }
            : r,
        ),
      )
      startTransition(() => router.refresh())
    } catch (e) {
      setErrorByToken((m) => ({ ...m, [token]: e instanceof Error ? e.message : 'נכשל' }))
    } finally {
      setBusyToken(null)
    }
  }

  return (
    <>
      {/* Filters + search */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
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

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-[13px] text-brand-primary/55 py-16 text-center">
          {rows.length === 0 ? 'עוד לא נשלחו בריפים' : 'אין תוצאות לסינון הזה'}
        </p>
      ) : (
        <ul className="divide-y divide-brand-primary/10">
          {filtered.map((r) => {
            const err = errorByToken[r.token]
            const busy = busyToken === r.token
            return (
              <li key={r.id} className="py-5 first:pt-0">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <Link
                        href={`/briefs/${r.token}`}
                        className="text-[16px] font-semibold hover:text-brand-accent transition-colors truncate"
                      >
                        {r.clientName || '(ללא שם)'}
                      </Link>
                      <BriefStatusBadge row={r} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] tracking-[0.12em] text-brand-primary/55 font-rubik font-medium">
                      <span>נשלח {formatShort(r.createdAt)}</span>
                      {r.completedAt && <span>· הוגש {formatShort(r.completedAt)}</span>}
                      {r.createdByName && <span>· {r.createdByName}</span>}
                      {r.clientEmail && (
                        <a
                          href={`mailto:${r.clientEmail}`}
                          className="hover:text-brand-accent transition-colors"
                        >
                          · {r.clientEmail}
                        </a>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px] tracking-[0.16em] uppercase font-rubik font-medium">
                      {r.briefDocLink && (
                        <a
                          href={r.briefDocLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-primary/60 hover:text-brand-accent transition-colors"
                        >
                          Google Doc ↗
                        </a>
                      )}
                      {r.driveFolderLink && (
                        <a
                          href={r.driveFolderLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-primary/60 hover:text-brand-accent transition-colors"
                        >
                          תיקיית בריף ↗
                        </a>
                      )}
                      {r.workspaceLink && (
                        <a
                          href={r.workspaceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-accent/90 hover:text-brand-accent transition-colors"
                        >
                          סביבת לקוח ↗
                        </a>
                      )}
                    </div>
                    {err && (
                      <p className="mt-2 text-[12px] text-red-600">{err}</p>
                    )}
                  </div>

                  {/* Outcome actions */}
                  <div className="shrink-0 flex items-center gap-2">
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
                    ) : (
                      <span className="text-[11px] tracking-[0.16em] uppercase font-rubik font-medium text-brand-primary/35">
                        ממתין להגשה
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function BriefStatusBadge({ row }: { row: BriefRow }) {
  if (row.outcome === 'won') {
    return (
      <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-emerald-50 text-emerald-700">
        נסגר
      </span>
    )
  }
  if (row.outcome === 'lost') {
    return (
      <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-red-50 text-red-600">
        נפל
      </span>
    )
  }
  if (row.status === 'completed') {
    return (
      <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-amber-50 text-amber-700">
        ממתין להחלטה
      </span>
    )
  }
  if (row.status === 'opened') {
    return (
      <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-blue-50 text-blue-700">
        במילוי
      </span>
    )
  }
  if (row.status === 'pending') {
    return (
      <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-brand-primary/8 text-brand-primary/65">
        נשלח
      </span>
    )
  }
  return (
    <span className="text-[10px] tracking-[0.24em] uppercase font-rubik font-medium px-2 py-0.5 rounded-sm bg-brand-primary/8 text-brand-primary/55">
      {row.status}
    </span>
  )
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
