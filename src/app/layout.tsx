import type { Metadata } from 'next'
import { Heebo, Assistant, Rubik } from 'next/font/google'
import { Toaster } from 'sonner'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
})

const assistant = Assistant({
  subsets: ['hebrew', 'latin'],
  variable: '--font-assistant',
  display: 'swap',
})

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-rubik',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Leaders AI — מצגות קריאטיב מבריף',
  description: 'סוכן AI שחוקר, מנסח ומעצב מצגות הצעת מחיר פרימיום למותגים',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${assistant.variable} ${rubik.variable}`}>
      <body className="font-heebo antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster dir="rtl" position="top-center" richColors closeButton />
      </body>
    </html>
  )
}





