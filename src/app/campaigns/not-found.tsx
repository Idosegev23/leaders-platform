import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-wizard-border bg-white p-6 text-center">
      <h1 className="text-lg font-bold">הדף לא נמצא</h1>
      <p className="mt-2 text-sm text-wizard-text-secondary">הרשומה לא קיימת או שאין לך גישה אליה.</p>
      <Link href="/campaigns" className="mt-4 inline-block text-sm font-medium text-brand-primary underline">חזרה לקמפיינים</Link>
    </div>
  )
}
