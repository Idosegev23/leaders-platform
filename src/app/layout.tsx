import type { Metadata } from 'next'
import { Heebo, Assistant, Rubik, Cormorant_Garamond } from 'next/font/google'
import { Toaster } from 'sonner'
import { AuthGuard } from '@/components/auth/AuthGuard'
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

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Leaders x OS',
  description: 'מבריף ועד השקה. מערכת פנימית של לידרס לניהול זרימת העבודה עם לקוחות.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={`${heebo.variable} ${assistant.variable} ${rubik.variable} ${cormorant.variable}`}
    >
      <body className="font-heebo antialiased bg-background text-foreground min-h-screen">
        <AuthGuard />
        {children}
        <Toaster dir="rtl" position="top-center" richColors closeButton />
      </body>
    </html>
  )
}





