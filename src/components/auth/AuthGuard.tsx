'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Catches mid-session auth loss and re-authenticates in place instead of
 * bouncing through /login. The user stays on whatever page they were on,
 * sees a modal, clicks "התחבר עם Google", round-trips through Google's
 * OAuth, and lands back on the *same* URL — no manual sign-out / sign-in
 * gymnastics.
 *
 * First-visit auth (no cookie at all) is still handled by the middleware
 * redirect to /login. This guards only the "I was working and got
 * kicked out" case.
 */
export function AuthGuard() {
  const [showModal, setShowModal] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const wasSignedIn = useRef(false)
  const ignoreFirstNull = useRef(true)

  useEffect(() => {
    const supabase = createClient()

    // Seed the "was signed in" flag from the current session so we
    // don't fire the modal on initial page load when the cookie has
    // already expired (middleware would have redirected).
    supabase.auth.getSession().then(({ data }) => {
      wasSignedIn.current = !!data.session
      ignoreFirstNull.current = false
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        wasSignedIn.current = true
        if (showModal) setShowModal(false)
        return
      }

      if (ignoreFirstNull.current) return
      // Only fire the modal if we were *previously* signed in this
      // session — otherwise this is the first paint without a cookie
      // and the middleware already redirected to /login.
      if (wasSignedIn.current && (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        setShowModal(true)
      }
    })

    // Belt + suspenders: also listen for 401s from our own API routes
    // and pop the modal. window.fetch is intercepted so we don't have
    // to retrofit every caller.
    const origFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await origFetch(...args)
      if (res.status === 401 && wasSignedIn.current) {
        // Probe whether Supabase still considers us signed in; if not,
        // the auth listener will have already fired. Just be safe.
        const { data } = await supabase.auth.getSession()
        if (!data.session) setShowModal(true)
      }
      return res
    }

    return () => {
      sub.subscription.unsubscribe()
      window.fetch = origFetch
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!showModal) return null

  return <ReauthModal onSignInStart={() => setSigningIn(true)} signingIn={signingIn} />
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
