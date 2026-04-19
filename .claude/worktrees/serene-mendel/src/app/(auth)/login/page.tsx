'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

function LoginContent() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') || '/dashboard'
  const authError = searchParams.get('error')

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(redirectTo)}`,
          scopes: 'openid email profile https://www.googleapis.com/auth/drive',
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account consent',
          },
        },
      })

      if (oauthError) throw oauthError
    } catch (err) {
      console.error('Google auth error:', err)
      setError('שגיאה בהתחברות עם Google. נסה שוב.')
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="relative z-10 w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-12">
        <Link href="/" className="inline-block">
          <Image
            src="/logo.png"
            alt="Leaders"
            width={140}
            height={47}
            className="mx-auto mb-4"
          />
          <h1 className="text-4xl font-heebo font-black text-white tracking-tight">
            Doc<span className="text-[#e94560]">Maker</span>
          </h1>
        </Link>
        <div className="h-0.5 w-16 bg-white mx-auto mt-4" />
      </div>

      <div className="border border-white/10 bg-[#1a1a1a] p-8">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">התחברות</h2>
          <p className="text-white/50 text-sm">התחבר כדי להמשיך</p>
        </div>

        {(error || authError) && (
          <div className="p-4 border border-red-500/30 bg-red-500/10 text-red-400 text-sm text-center mb-6">
            {error || (authError === 'auth_failed' ? 'ההתחברות נכשלה. נסה שוב.' : authError)}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full px-8 py-4 bg-white text-black font-bold text-lg hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {isGoogleLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              מתחבר...
            </span>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              התחבר עם Google
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#0f0f0f] relative">
      {/* Grid Background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #ffffff 1px, transparent 1px),
            linear-gradient(to bottom, #ffffff 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px'
        }}
      />

      <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
      <div className="absolute bottom-1/3 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />

      <Suspense fallback={
        <div className="flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-white/30 border-t-white rounded-full" />
        </div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  )
}
