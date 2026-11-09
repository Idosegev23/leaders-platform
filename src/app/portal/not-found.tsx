import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="rounded-2xl border border-wizard-border bg-white p-5 text-center">
      <h1 className="text-lg font-bold">הדף לא נמצא</h1>
      <p className="mt-2 text-sm text-wizard-text-secondary">הפריט לא קיים או שאין לכם גישה אליו.</p>
      <Link href="/portal" className="mt-3 inline-block text-sm text-brand-primary underline">חזרה לפורטל</Link>
    </div>
  )
}
