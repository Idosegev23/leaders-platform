'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GenerateError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[GenerateError]', error)
  }, [error])

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/10 mx-auto mb-6 flex items-center justify-center">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">שגיאה ביצירת המצגת</h1>
        <p className="text-gray-400 mb-2 text-sm">{error.message}</p>
        <p className="text-gray-600 mb-8 text-xs">
          ייתכן שמדובר בבעיה זמנית. נסו שוב או חזרו לדשבורד.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-white text-[#0a0a0f] rounded-xl font-semibold text-sm hover:bg-gray-100 transition-colors"
          >
            נסה שוב
          </button>
          <Link
            href="/dashboard"
            className="px-6 py-2.5 bg-white/10 text-white rounded-xl font-semibold text-sm hover:bg-white/20 transition-colors"
          >
            חזרה לדשבורד
          </Link>
        </div>
      </div>
    </div>
  )
}
