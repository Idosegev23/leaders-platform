'use client'

export default function CampaignsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
      <h1 className="text-lg font-bold text-rose-900">לא הצלחנו לטעון את הדף</h1>
      <p className="mt-2 text-sm text-rose-900">ייתכן שיש תקלה זמנית בחיבור לשרת. הנתונים שלכם לא השתנו.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm text-white">ניסיון חוזר</button>
    </div>
  )
}
