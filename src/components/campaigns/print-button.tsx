'use client'

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="rounded-xl bg-brand-primary px-4 py-2 text-sm text-white">הדפסה / שמירה כ-PDF</button>
}
