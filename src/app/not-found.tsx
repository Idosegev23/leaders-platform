import Link from 'next/link'

export default function NotFound() {
  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-[#f4f5f7] px-4">
      <div className="max-w-md w-full text-center">
        <div className="text-7xl font-bold text-gray-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">העמוד לא נמצא</h1>
        <p className="text-gray-500 mb-8">
          הדף שחיפשת לא קיים או שהוסר.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-6 py-2.5 bg-[#0f172a] text-white rounded-xl font-semibold hover:bg-[#1e293b] transition-colors"
        >
          חזרה לדשבורד
        </Link>
      </div>
    </div>
  )
}
