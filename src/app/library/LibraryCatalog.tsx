'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  LIBRARY_DOCS,
  LIBRARY_CATEGORIES,
  KIND_LABELS,
  type LibraryDoc,
} from '@/lib/library/data'

export default function LibraryCatalog() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim()
    return LIBRARY_DOCS.filter((d) => {
      if (category && d.category !== category) return false
      if (q && !d.name.includes(q) && !d.category.includes(q)) return false
      return true
    })
  }, [query, category])

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryDoc[]>()
    for (const d of filtered) {
      const list = map.get(d.category)
      if (list) list.push(d)
      else map.set(d.category, [d])
    }
    return LIBRARY_CATEGORIES.filter((c) => map.has(c)).map((c) => ({
      category: c,
      docs: map.get(c)!,
    }))
  }, [filtered])

  return (
    <div>
      {/* Search + filters */}
      <div className="mb-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש מסמך…"
          className="w-full md:max-w-sm px-4 py-2.5 text-[14px] bg-brand-ivory ring-1 ring-brand-primary/15 rounded-sm outline-none focus:ring-brand-primary/40 placeholder:text-brand-primary/40 transition-shadow"
        />
        <div className="mt-4 flex flex-wrap gap-1.5">
          <FilterChip
            label={`הכל (${LIBRARY_DOCS.length})`}
            active={category === null}
            onClick={() => setCategory(null)}
          />
          {LIBRARY_CATEGORIES.map((c) => (
            <FilterChip
              key={c}
              label={c}
              active={category === c}
              onClick={() => setCategory(category === c ? null : c)}
            />
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <p className="text-[13px] text-brand-primary/55 py-16 text-center">
          לא נמצאו מסמכים תואמים
        </p>
      ) : (
        grouped.map(({ category: cat, docs }) => (
          <section key={cat} className="mb-10">
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-[11px] tracking-[0.32em] uppercase text-brand-primary/65 font-rubik font-medium">
                {cat}
              </h2>
              <div className="h-px flex-1 bg-brand-primary/10" />
              <span className="text-[10px] tracking-[0.24em] uppercase text-brand-primary/45 font-rubik font-medium tabular-nums">
                {docs.length}
              </span>
            </div>
            <ul className="divide-y divide-brand-primary/8">
              {docs.map((d) => (
                <li key={`${d.category}-${d.name}`}>
                  <DocRow doc={d} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] rounded-sm ring-1 transition-colors ${
        active
          ? 'bg-brand-primary text-brand-ivory ring-brand-primary'
          : 'bg-brand-ivory text-brand-primary/70 ring-brand-primary/15 hover:ring-brand-primary/35'
      }`}
    >
      {label}
    </button>
  )
}

function DocRow({ doc }: { doc: LibraryDoc }) {
  const main = (
    <>
      <KindBadge doc={doc} />
      <p className="min-w-0 flex-1 text-[15px] font-medium truncate">{doc.name}</p>
    </>
  )

  return (
    <div
      className={`flex items-center gap-4 py-3.5 px-2 -mx-2 rounded-sm transition-colors ${
        doc.url ? 'hover:bg-brand-primary/[0.03]' : 'opacity-45'
      }`}
    >
      {doc.url ? (
        doc.kind === 'internal' ? (
          <Link href={doc.url} className="flex items-center gap-4 min-w-0 flex-1">
            {main}
          </Link>
        ) : (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 min-w-0 flex-1"
          >
            {main}
          </a>
        )
      ) : (
        <div className="flex items-center gap-4 min-w-0 flex-1">{main}</div>
      )}

      {doc.onlineUrl && (
        <Link
          href={doc.onlineUrl}
          className="shrink-0 px-2.5 py-1 text-[11px] font-rubik font-medium rounded-sm ring-1 bg-brand-accent/10 text-brand-accent ring-brand-accent/25 hover:bg-brand-accent hover:text-white transition-colors"
        >
          ✦ מילוי מקוון
        </Link>
      )}

      {doc.url ? (
        <span className="text-brand-primary/35 text-base shrink-0">←</span>
      ) : (
        <span className="text-[10px] tracking-[0.2em] uppercase text-brand-primary/45 font-rubik font-medium shrink-0">
          אין קישור עדיין
        </span>
      )}
    </div>
  )
}

function KindBadge({ doc }: { doc: LibraryDoc }) {
  const label = doc.kind ? KIND_LABELS[doc.kind] : '—'
  const tone =
    doc.kind === 'internal'
      ? 'bg-brand-accent/10 text-brand-accent ring-brand-accent/25'
      : 'bg-brand-primary/[0.04] text-brand-primary/55 ring-brand-primary/10'
  return (
    <span
      className={`shrink-0 w-16 text-center px-2 py-1 text-[10px] tracking-[0.08em] font-rubik font-medium rounded-sm ring-1 ${tone}`}
    >
      {label}
    </span>
  )
}
