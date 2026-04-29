'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Catches *mid-work* auth loss and re-authenticates in place. Three unambiguous
 * triggers:
 *
 *   1. 401 from our own /api/* routes — user tried to do real work and was
 *      rejected. We intercept window.fetch.
 *   2. The "auth:reauth-required" DOM event — fired by feature code that
 *      itself knows credentials are missing (Drive Picker without provider
 *      token, Gmail send needing a fresh scope, etc.). Anyone can dispatch.
 *   3. Proactive on-mount scope check — if the Supabase session is alive but
 *      provider_token is missing/expired, surface the modal immediately so
 *      Drive/Gmail/Calendar features don't dead-end the user later. The
 *      modal is dismissible — the user can close it and continue, but the
 *      next Drive/Gmail click will pop it again via trigger 2.
 *
 * Intentional sign-out via "התנתק" goes straight to /login — no modal.
 * First-visit auth (no cookie) handled by middleware. Idle expiry waits
 * until the user actually tries something.
 *
 * To trigger from anywhere:
 *   window.dispatchEvent(new CustomEvent('auth:reauth-required',
 *     { detail: { reason: 'drive-picker' } }))
 */
export const REAUTH_EVENT = 'auth:reauth-required'

export function dispatchReauthRequired(reason?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(REAUTH_EVENT, { detail: { reason } }))
}

/** Pages where AuthGuard should not run a proactive scope check (no user is
 *  expected to be signed in there). Trigger 2 (explicit event) still works. */
const PUBLIC_PATH_PREFIXES = ['/login', '/forms/', '/sign/', '/s/']

function isPublicPage(): boolean {
  if (typeof window === 'undefined') return true
  return PUBLIC_PATH_PREFIXES.some((p) => window.location.pathname.startsWith(p))
}

export function AuthGuard() {
  const [showModal, setShowModal] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)
  const [signingIn, setSigningIn] = useState(false)
  const hadSessionAtMount = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    const isPublic = isPublicPage()

    // Trigger 3 (proactive scope check) — fire-and-forget once on mount.
    supabase.auth.getSession().then(({ data }) => {
      hadSessionAtMount.current = !!data.session
      if (isPublic) return
      const session = data.session
      if (!session?.user) return // not signed in at all → middleware handles it
      if (!session.provider_token) {
        // Supabase session is alive but Google scope token is gone (expired
        // or never granted). Surface the modal so the user can re-auth
        // before clicking anything Drive/Gmail-related.
        console.log('[AuthGuard] Proactive scope check: session present but provider_token missing → showing modal')
        setReason('proactive-scope-check')
        setShowModal(true)
      }
    })

    // Trigger 1: 401 from our own /api/*.
    const origFetch = window.fetch
    window.fetch = async (...args) => {
      const res = await origFetch(...args)
      if (
        res.status === 401 &&
        hadSessionAtMount.current &&
        looksLikeOwnApi(args[0])
      ) {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          setReason('api-401')
          setShowModal(true)
        }
      }
      return res
    }

    // Trigger 2: explicit re-auth events from feature code.
    function onReauth(ev: Event) {
      const detail = (ev as CustomEvent).detail as { reason?: string } | undefined
      console.log(`[AuthGuard] reauth-required event (reason=${detail?.reason || 'unspecified'})`)
      setReason(detail?.reason)
      setShowModal(true)
    }
    window.addEventListener(REAUTH_EVENT, onReauth)

    return () => {
      window.fetch = origFetch
      window.removeEventListener(REAUTH_EVENT, onReauth)
    }
  }, [])

  if (!showModal) return null

  return (
    <ReauthModal
      reason={reason}
      onSignInStart={() => setSigningIn(true)}
      onClose={() => setShowModal(false)}
      signingIn={signingIn}
    />
  )
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

function ReauthModal({
  reason,
  onSignInStart,
  onClose,
  signingIn,
}: {
  reason?: string
  onSignInStart: () => void
  onClose: () => void
  signingIn: boolean
}) {
  // Tailor the copy slightly so the proactive case doesn't sound alarming.
  const copy = (() => {
    if (reason === 'drive-picker' || reason === 'drive-folder-picker' || reason === 'drive-save') {
      return {
        title: 'נדרשת הרשאה ל-Drive',
        body: 'כדי לפתוח את חלון Google Drive, התחבר עכשיו עם Google. אחרי האישור תחזור בדיוק למקום שהיית בו.',
      }
    }
    if (reason === 'proactive-scope-check') {
      return {
        title: 'ההרשאה ל-Google פגה.',
        body: 'התחברות מחדש עם Google תחדש את הגישה ל-Drive, Gmail ו-Calendar. אפשר להתחבר עכשיו או לסגור ולהמשיך — נזכיר כשתצטרך.',
      }
    }
    return {
      title: 'ההתחברות פגה.',
      body: 'אנחנו מקפידים על login טרי בכל סשן כדי לשמור על Drive ו-Gmail מחוברים. התחבר שוב עם Google כדי לחזור למקום שהיית בו — בלי לצאת מהדף.',
    }
  })()

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
      <div className="relative w-full max-w-sm bg-brand-ivory text-brand-primary rounded-sm ring-1 ring-brand-primary/15 shadow-2xl overflow-hidden">
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="absolute top-3 left-3 z-10 w-7 h-7 inline-flex items-center justify-center rounded-full text-brand-primary/55 hover:text-brand-primary hover:bg-brand-primary/8 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="px-7 pt-7 pb-3">
          <p className="text-[10px] tracking-[0.4em] uppercase text-brand-primary/55 font-rubik font-medium">
            Leaders <span className="mx-1 text-brand-primary/75">x</span> OS
          </p>
          <h2 className="mt-3 text-[22px] font-bold leading-tight">
            {copy.title}
          </h2>
          <p className="mt-2 text-[14px] text-brand-primary/65 leading-relaxed">
            {copy.body}
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
