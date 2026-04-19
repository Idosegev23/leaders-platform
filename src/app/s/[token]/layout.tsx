import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Presentation',
  description: 'Interactive presentation',
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f]" style={{ fontFamily: "'Heebo', sans-serif" }}>
      {children}
    </div>
  )
}
