'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Catches *mid-work* auth loss and re-authenticates in place. Only fires
 * when the user actually tries to do something authenticated and gets a
 * 401 back. Intentional sign-out via "התנתק" goes straight to /login
 * with no modal — the dedicated login page is the right place for that.
 *
 * First-visit auth (no cookie at all) is handled by the middleware
 * redirect to /login. Idle expiry is handled lazily — we don't pop a
 * modal on a user who's just looking at the page; we only intervene
 * when they click something and get rejected.
 *
 * Earlier this also fired on Supabase's onAuthStateChange SIGNED_OUT
 * event, but that event is ambiguous — it fires both on token expiry
 * AND on user-initiated signOut(). Using it caused the popup to flash
 * every time the user logged out. The 401-from-our-API signal is
 * unambiguous: if you got a 401, you tried to do real work and were
 * rejected. That's the only case worth interrupting for.
 */
export function AuthGuard() {
  const [showModal, setShowModal] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const hadSessionAtMount = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getSession().then(({ data }) => {
      hadSessionAtMount.current = !!data.session
    })

    // Single trigger: 401 from our own API. We don't react to
    // onAuthStateChange at all — see component docstring.
    const origFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await origFetch(...args)
      if (
        res.status === 401 &&
        hadSessionAtMount.current &&
        // Only handle our own routes; third-party 401s aren't ours to fix.
        looksLikeOwnApi(args[0])
      ) {
        const { data } = await supabase.auth.getSession()
        if (!data.session) setShowModal(true)
      }
      return res
    }

    return () => {
      window.fetch = origFetch
    }
  }, [])

  if (!showModal) return null

  return <ReauthModal onSignInStart={() => setSigningIn(true)} signingIn={signingIn} />
}

function looksLikeOwnApi(input: RequestInfo | URL): boolean {
  try {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url
    if (!url) return false
    if (url.startsWith('/')) return url.startsWith('/api/')
    const u = new URL(url)
    return u.origin === window.location.origin && u.pathname.startsWith('/api/')
  } catch {
    return false
  }
}

function ReauthModal({ onSignInStart, signingIn }: { onSignInStart: () => void; signingIn: boolean }) {
  const handleSignIn = async () => {
    onSignInStart()
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Round-trip the user back to where they were.
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`
          : undefined,
        scopes:
          'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account consent',
        },
      },
    })
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[200] bg-brand-primary/55 backdrop-blur-md flex items-center justify-center p-4 font-heebo"
    >
      <div className="w-full max-w-sm bg-brand-ivory text-brand-primary rounded-sm ring-1 ring-brand-primary/15 shadow-2xl overflow-hidden">
        <div className="px-7 pt-7 pb-3">
          <p className="text-[10px] tracking-[0.4em] uppercase text-brand-primary/55 font-rubik font-medium">
            Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
          </p>
          <h2 className="mt-3 text-[22px] font-bold leading-tight">
            ההתחברות פגה.
          </h2>
          <p className="mt-2 text-[14px] text-brand-primary/65 leading-relaxed">
            אנחנו מקפידים על login טרי בכל סשן כדי לשמור על Drive ו-Gmail מחוברים.
            התחבר שוב עם Google כדי לחזור למקום שהיית בו — בלי לצאת מהדף.
          </p>
        </div>
        <div className="px-7 pb-7 pt-2">
          <button
            type="button"
            onClick={handleSignIn}
            disabled={signingIn}
            className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-brand-primary text-brand-ivory py-3.5 text-[14px] font-semibold tracking-[0.04em] transition-colors hover:bg-brand-accent disabled:opacity-50"
          >
            {signingIn ? 'מעביר ל-Google…' : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>התחבר עם Google</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
