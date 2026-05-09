'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Shared customer picker.
 *
 * Two sources of truth, merged + de-duped by (case-insensitive) name:
 *   1. /api/clients/with-completed-brief  — clients who filled the brief
 *   2. /api/clickup/customers             — existing lists in ClickUp's
 *      "Leaders Customers" folder
 *
 * Used in:
 *   - /inner-meeting (kickoff form)
 *   - /price-quote   (quote form)
 *
 * Picking a known client surfaces both badges so the user knows what
 * data is attached. Free-text input via the "לקוח חדש" toggle for
 * brand-new entries.
 */

export interface CustomerOption {
  name: string
  /** Token of the completed brief link, if this client has one. */
  briefLinkToken?: string
  /** ClickUp customer-list id, if a list already exists. */
  clickupListId?: string
}

interface Props {
  value: string
  onChange: (option: CustomerOption) => void
  /** Show a small input under the dropdown for "new client" name entry. */
  allowFreeText?: boolean
  required?: boolean
  label?: string
  placeholder?: string
  className?: string
  disabled?: boolean
}

export default function CustomerPicker({
  value,
  onChange,
  allowFreeText = true,
  required,
  label = 'שם לקוח',
  placeholder = 'בחר מהרשימה או הקלד שם חדש',
  className,
  disabled,
}: Props) {
  const [options, setOptions] = useState<CustomerOption[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load + merge both sources once.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [briefsRes, clickupRes] = await Promise.all([
          fetch('/api/clients/with-completed-brief')
            .then((r) => (r.ok ? r.json() : { clients: [] }))
            .catch(() => ({ clients: [] })),
          fetch('/api/clickup/customers')
            .then((r) => (r.ok ? r.json() : { customers: [] }))
            .catch(() => ({ customers: [] })),
        ])
        if (!alive) return
        type Brief = { client_name?: string | null; link_token?: string }
        type CU = { id: string; name: string }
        const merged = new Map<string, CustomerOption>()
        for (const c of (briefsRes.clients || []) as Brief[]) {
          const name = (c.client_name || '').trim()
          if (!name) continue
          merged.set(name.toLowerCase(), {
            name,
            briefLinkToken: c.link_token,
          })
        }
        for (const c of (clickupRes.customers || []) as CU[]) {
          const key = c.name.toLowerCase()
          const existing = merged.get(key)
          if (existing) {
            existing.clickupListId = c.id
          } else {
            merged.set(key, { name: c.name, clickupListId: c.id })
          }
        }
        const sorted = Array.from(merged.values()).sort((a, b) => {
          // Brief-backed first → ClickUp-backed next → alphabetical.
          const score = (x: CustomerOption) =>
            x.briefLinkToken ? 0 : x.clickupListId ? 1 : 2
          const sa = score(a)
          const sb = score(b)
          if (sa !== sb) return sa - sb
          return a.name.localeCompare(b.name, 'he')
        })
        setOptions(sorted)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Outside-click closes the dropdown.
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, search])

  // Manual entry mode.
  if (manualMode) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            {label}
            {required && <span className="text-red-500 mr-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange({ name: e.target.value })}
            disabled={disabled}
            placeholder="הזן שם לקוח חדש"
            autoFocus
            dir="rtl"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none transition"
          />
          <button
            type="button"
            onClick={() => {
              setManualMode(false)
              onChange({ name: '' })
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
          >
            חזרה לרשימה
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={className} ref={containerRef}>
      {label && (
        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          dir="rtl"
          className={`w-full px-4 py-2.5 border rounded-lg text-right flex items-center justify-between transition ${
            open
              ? 'border-orange-500 ring-2 ring-orange-200'
              : 'border-gray-300 hover:border-gray-400'
          } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
        >
          <span className={value ? 'text-gray-900' : 'text-gray-400'}>
            {loading ? 'טוען לקוחות…' : value || placeholder}
          </span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="חיפוש…"
                dir="rtl"
                className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-orange-500"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-64">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {options.length === 0 ? 'אין לקוחות עדיין' : 'לא נמצאו תוצאות'}
                </div>
              ) : (
                filtered.map((opt) => (
                  <button
                    key={`${opt.name}-${opt.clickupListId || opt.briefLinkToken || 'none'}`}
                    type="button"
                    onClick={() => {
                      onChange(opt)
                      setOpen(false)
                      setSearch('')
                    }}
                    className="w-full px-4 py-2.5 text-right hover:bg-orange-50 transition flex items-center justify-between gap-2"
                  >
                    <span className="font-medium text-gray-900 text-sm">{opt.name}</span>
                    <span className="flex items-center gap-1">
                      {opt.briefLinkToken && (
                        <span className="text-[10px] font-bold tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                          ✓ בריף
                        </span>
                      )}
                      {opt.clickupListId && (
                        <span className="text-[10px] font-bold tracking-wider text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
                          ClickUp
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
            {allowFreeText && (
              <div className="p-2 border-t border-gray-100 bg-gray-50">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    setManualMode(true)
                  }}
                  className="w-full text-center text-sm text-blue-600 hover:text-blue-800 py-1"
                >
                  + לקוח חדש (הזנה ידנית)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
