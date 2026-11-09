'use client'

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
      <h1 className="text-lg font-bold text-rose-900">משהו השתבש</h1>
      <p className="mt-2 text-sm text-rose-900">לא הצלחנו לטעון את הדף. שום דבר לא השתנה.</p>
      <button type="button" onClick={reset} className="mt-3 rounded-xl bg-rose-700 px-4 py-2 text-sm text-white">ניסיון חוזר</button>
    </div>
  )
}
