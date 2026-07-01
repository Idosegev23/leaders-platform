'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Inline נסגר/נפל buttons on the brief view page.
 *
 * Talks to POST /api/briefs/[token]/outcome, which already handles
 * moving the Drive folder + Google Doc into BRIEFS_COMPLETED (won) or
 * BRIEFS_FAILED (lost), and eagerly creates the per-client workspace on
 * won so the UI can hand back a link immediately.
 *
 * If the outcome is already set, we render a frozen badge with the
 * timestamp so it's clear this is decided.
 */
export default function OutcomeActions({
  token,
  initialOutcome,
  initialOutcomeAt,
  initialOutcomeBy,
  initialWorkspaceLink,
  isEnglish,
}: {
  token: string
  initialOutcome: 'won' | 'lost' | null
  initialOutcomeAt: string | null
  initialOutcomeBy: string | null
  initialWorkspaceLink: string | null
  isEnglish: boolean
}) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<'won' | 'lost' | null>(initialOutcome)
  const [outcomeAt, setOutcomeAt] = useState<string | null>(initialOutcomeAt)
  const [workspaceLink, setWorkspaceLink] = useState<string | null>(initialWorkspaceLink)
  const [busy, setBusy] = useState<'won' | 'lost' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const labels = isEnglish
    ? {
        won: 'Won',
        lost: 'Lost',
        confirmWon: 'Mark this brief as won? This moves the Drive folder to "נסגר" and opens a client workspace.',
        confirmLost: 'Mark this brief as lost? This moves the Drive folder to "נפל".',
        wonDecided: 'Marked as Won',
        lostDecided: 'Marked as Lost',
        on: 'on',
        openWorkspace: 'Open client workspace ↗',
        change: 'Change',
      }
    : {
        won: 'נסגר',
        lost: 'נפל',
        confirmWon: 'לסמן את הבריף כנסגר? התיקייה ב-Drive עוברת ל"נסגר" ונפתח workspace ללקוח.',
        confirmLost: 'לסמן את הבריף כנפל? התיקייה ב-Drive עוברת ל"נפל".',
        wonDecided: 'הבריף סומן כנסגר',
        lostDecided: 'הבריף סומן כנפל',
        on: 'בתאריך',
        openWorkspace: 'פתח workspace ללקוח ↗',
        change: 'שנה',
      }

  const submit = async (next: 'won' | 'lost') => {
    const ok = window.confirm(next === 'won' ? labels.confirmWon : labels.confirmLost)
    if (!ok) return
    setBusy(next)
    setError(null)
    try {
      const res = await fetch(`/api/briefs/${token}/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'failed')
      setOutcome(next)
      setOutcomeAt(new Date().toISOString())
      if (next === 'won' && data.workspace_link) setWorkspaceLink(data.workspace_link)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setBusy(null)
    }
  }

  if (outcome) {
    const tone = outcome === 'won' ? 'emerald' : 'red'
    return (
      <div
        className={`rounded-sm ring-1 p-5 ${
          tone === 'emerald'
            ? 'ring-emerald-200 bg-emerald-50/70'
            : 'ring-red-200 bg-red-50/60'
        }`}
      >
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p
              className={`text-[11px] tracking-[0.32em] uppercase font-rubik font-medium ${
                tone === 'emerald' ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {outcome === 'won' ? labels.wonDecided : labels.lostDecided}
            </p>
            <p className="mt-1 text-[13px] text-brand-primary/70">
              {outcomeAt && `${labels.on} ${formatFull(outcomeAt, isEnglish)}`}
              {initialOutcomeBy && ` · ${initialOutcomeBy}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {outcome === 'won' && workspaceLink && (
              <a
                href={workspaceLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] tracking-[0.24em] uppercase font-rubik font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
              >
                {labels.openWorkspace}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(isEnglish ? 'Re-open this outcome decision?' : 'לפתוח מחדש את ההחלטה?')) {
                  setOutcome(null)
                }
              }}
              className="text-[11px] tracking-[0.24em] uppercase font-rubik font-medium text-brand-primary/55 hover:text-brand-accent transition-colors"
            >
              {labels.change}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-sm ring-1 ring-brand-primary/15 p-5 bg-brand-ivory">
      <p className="text-[11px] tracking-[0.32em] uppercase font-rubik font-medium text-brand-primary/65 mb-3">
        {isEnglish ? 'Decide' : 'החלט'}
      </p>
      <p className="text-[13px] text-brand-primary/70 mb-4 leading-relaxed">
        {isEnglish
          ? 'Won moves the brief into BRIEFS_COMPLETED and opens a client workspace. Lost moves it into BRIEFS_FAILED.'
          : 'נסגר מעביר את התיקייה ל"נסגר" ב-Drive ופותח workspace ללקוח. נפל מעביר את התיקייה ל"נפל".'}
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={() => submit('won')}
          disabled={busy !== null}
          className="px-5 py-2 rounded-sm bg-emerald-600 text-white text-[13px] font-medium tracking-[0.04em] hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'won' ? (isEnglish ? 'Working…' : 'מעבד…') : labels.won}
        </button>
        <button
          type="button"
          onClick={() => submit('lost')}
          disabled={busy !== null}
          className="px-5 py-2 rounded-sm border border-brand-primary/20 text-brand-primary text-[13px] font-medium tracking-[0.04em] hover:bg-brand-primary/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'lost' ? (isEnglish ? 'Working…' : 'מעבד…') : labels.lost}
        </button>
        {error && <span className="text-[12px] text-red-600">{error}</span>}
      </div>
    </div>
  )
}

function formatFull(iso: string, isEnglish: boolean): string {
  const d = new Date(iso)
  const locale = isEnglish ? 'en-US' : 'he-IL'
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Asia/Jerusalem' })
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })
  return `${date} · ${time}`
}
