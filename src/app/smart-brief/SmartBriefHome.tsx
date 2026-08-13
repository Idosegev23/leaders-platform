'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SMART_BRIEF_TEMPLATES, getTemplate } from '@/lib/smart-brief/templates'

export type BriefListItem = {
  id: string
  template_slug: string
  title: string | null
  client_name: string | null
  status: 'draft' | 'sent'
  created_by_name: string | null
  updated_at: string
  opened_at: string | null
}

export default function SmartBriefHome({ initialBriefs }: { initialBriefs: BriefListItem[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState<string | null>(null)
  const autoCreated = useRef(false)

  const createBrief = async (templateSlug: string) => {
    if (creating) return
    setCreating(templateSlug)
    try {
      const res = await fetch('/api/smart-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateSlug }),
      })
      const json = await res.json()
      if (res.ok && json.id) {
        router.push(`/smart-brief/${json.id}`)
        return
      }
      alert(json.error ?? 'יצירת הבריף נכשלה')
    } catch {
      alert('יצירת הבריף נכשלה')
    }
    setCreating(null)
  }

  // Deep-link from the docs library: /smart-brief?template=<slug>
  useEffect(() => {
    const slug = searchParams.get('template')
    if (slug && getTemplate(slug) && !autoCreated.current) {
      autoCreated.current = true
      createBrief(slug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  return (
    <div>
      {/* Template picker */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-16">
        {SMART_BRIEF_TEMPLATES.map((t, idx) => (
          <button
            key={t.slug}
            type="button"
            onClick={() => createBrief(t.slug)}
            disabled={creating !== null}
            className="group relative text-right h-44 md:h-48 p-6 ring-1 ring-brand-primary/10 rounded-sm bg-brand-ivory transition-all duration-300 hover:ring-brand-primary/25 hover:-translate-y-[2px] hover:shadow-[0_12px_28px_-18px_rgba(26,26,46,0.18)] disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/55 font-rubik font-medium">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <span className="text-brand-primary/35 text-base transition-colors group-hover:text-brand-accent">
                {creating === t.slug ? '…' : '+'}
              </span>
            </div>
            <div className="absolute bottom-6 start-6 end-6">
              <p className="text-[17px] md:text-[18px] font-semibold leading-tight">{t.name}</p>
              <p className="mt-1 text-[11px] text-brand-primary/55 font-rubik tracking-[0.04em] uppercase font-medium">
                {t.english}
              </p>
              <p className="mt-2 text-[12px] text-brand-primary/65 leading-relaxed line-clamp-2">
                {t.description}
              </p>
            </div>
          </button>
        ))}
      </section>

      {/* Recent briefs */}
      <section>
        <div className="flex items-center gap-4 mb-4">
          <span className="text-[10px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
            בריפים אחרונים
          </span>
          <div className="h-px flex-1 bg-brand-primary/10" />
        </div>

        {initialBriefs.length === 0 ? (
          <p className="text-[13px] text-brand-primary/55 py-10 text-center">
            עדיין לא נוצרו בריפים — בחר תבנית למעלה כדי להתחיל
          </p>
        ) : (
          <ul className="divide-y divide-brand-primary/8">
            {initialBriefs.map((b) => {
              const template = getTemplate(b.template_slug)
              return (
                <li key={b.id}>
                  <Link
                    href={`/smart-brief/${b.id}`}
                    className="flex items-center gap-4 py-3.5 px-2 -mx-2 rounded-sm hover:bg-brand-primary/[0.03] transition-colors"
                  >
                    <StatusDot status={b.status} opened={Boolean(b.opened_at)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-medium truncate">
                        {b.title || template?.name || b.template_slug}
                      </p>
                      <p className="mt-0.5 text-[11px] text-brand-primary/50 font-rubik">
                        {template?.name}
                        {b.created_by_name ? ` · ${b.created_by_name}` : ''}
                        {' · '}
                        {new Date(b.updated_at).toLocaleDateString('he-IL')}
                      </p>
                    </div>
                    <span className="text-[10px] tracking-[0.2em] uppercase text-brand-primary/45 font-rubik font-medium shrink-0">
                      {b.status === 'sent' ? (b.opened_at ? 'נפתח' : 'נשלח') : 'טיוטה'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function StatusDot({ status, opened }: { status: 'draft' | 'sent'; opened: boolean }) {
  const color =
    status === 'draft' ? 'bg-brand-primary/30' : opened ? 'bg-brand-accent' : 'bg-brand-gold'
  return <span className={`h-2 w-2 rounded-full shrink-0 ${color}`} aria-hidden />
}
