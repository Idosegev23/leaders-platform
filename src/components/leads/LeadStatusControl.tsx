'use client'

import { useState, useRef, useEffect } from 'react'

type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'

const OPTIONS: Array<{ value: LeadStatus; label: string; color: string }> = [
  { value: 'new',       label: 'ליד חדש',  color: 'bg-brand-gold' },
  { value: 'contacted', label: 'בטיפול',   color: 'bg-brand-primary' },
  { value: 'qualified', label: 'מאומת',    color: 'bg-brand-primary/55' },
  { value: 'converted', label: 'הומר',     color: 'bg-brand-accent' },
  { value: 'rejected',  label: 'נדחה',     color: 'bg-brand-primary/30' },
]

export function LeadStatusControl({
  leadId,
  currentStatus,
}: {
  leadId: string
  currentStatus: LeadStatus
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<LeadStatus | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const current = OPTIONS.find((o) => o.value === currentStatus) ?? OPTIONS[0]
  const display = pending ? OPTIONS.find((o) => o.value === pending) ?? current : current

  const handleChange = async (next: LeadStatus) => {
    if (next === currentStatus) {
      setOpen(false)
      return
    }
    setPending(next)
    setOpen(false)
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) throw new Error('patch failed')
      // Realtime sync will refresh the list + reset optimistic pending.
    } catch {
      setPending(null)
    }
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full ring-1 ring-brand-primary/15 bg-brand-ivory text-[11px] tracking-[0.12em] uppercase text-brand-primary/75 hover:text-brand-primary hover:ring-brand-primary/35 font-rubik font-medium transition-colors"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${display.color}`} />
        {display.label}
        <span className="text-brand-primary/45 text-[10px]">▾</span>
      </button>

      {open && (
        <ul className="absolute end-0 top-full mt-2 w-40 rounded-sm bg-brand-ivory ring-1 ring-brand-primary/15 shadow-xl z-30 py-1">
          {OPTIONS.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => handleChange(o.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-right hover:bg-brand-primary/5 transition-colors ${
                  o.value === currentStatus ? 'text-brand-primary font-semibold' : 'text-brand-primary/65'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${o.color}`} />
                <span className="flex-1">{o.label}</span>
                {o.value === currentStatus && <span className="text-brand-accent text-[10px]">●</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
