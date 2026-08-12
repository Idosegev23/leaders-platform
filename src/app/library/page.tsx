import type { Metadata } from 'next'
import { LIBRARY_DOCS } from '@/lib/library/data'
import LibraryCatalog from './LibraryCatalog'

export const metadata: Metadata = {
  title: 'ספריית מסמכים | Leaders OS',
}

export default function LibraryPage() {
  const total = LIBRARY_DOCS.length

  return (
    <div dir="rtl" className="max-w-6xl mx-auto px-4 md:px-8 py-12 md:py-16 text-brand-primary">
      <header className="mb-10 md:mb-12">
        <p className="text-[10px] tracking-[0.5em] uppercase text-brand-primary/55 font-rubik mb-5 font-medium">
          Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
        </p>
        <h1 className="text-[34px] md:text-[44px] leading-[1.05] font-medium tracking-tight">
          ספריית <span className="font-bold">מסמכים</span>
        </h1>
        <p className="mt-3 text-[14px] md:text-[15px] text-brand-primary/65 max-w-lg leading-relaxed">
          כל הטמפלטים, הנהלים ומסמכי העבודה של לידרס במקום אחד — {total} מסמכים,
          עד שכולם יעברו לגרסה מקוונת בתוך המערכת.
        </p>
      </header>

      <LibraryCatalog />
    </div>
  )
}
