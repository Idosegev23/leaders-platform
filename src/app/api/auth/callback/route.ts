import { NextResponse } from 'next/server'

export const maxDuration = 30
import { createServerClient, type CookieOptions } from '@supabase/ssr'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Explicit admin emails from environment variable
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean)

// Whitelist policy: anyone whose Google account is on the Leaders Workspace
// domain is automatically admitted. Google validates domain ownership during
// Workspace setup, so a successful OAuth login with @ldrsgroup.com proves
// the user is a real Leaders employee — no `contacts` table lookup needed.
// ALLOWED_DOMAINS lets us extend this later (e.g. ldrs.co.il) without code.
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'ldrsgroup.com')
  .split(',')
  .map(d => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean)

function isLeadersEmail(email: string): boolean {
  const lower = email.toLowerCase()
  if (ADMIN_EMAILS.includes(lower)) return true
  const at = lower.lastIndexOf('@')
  if (at === -1) return false
  const domain = lower.slice(at + 1)
  return ALLOWED_DOMAINS.includes(domain)
}

type CookieToSet = { name: string; value: string; options?: CookieOptions }

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/dashboard'

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: CookieToSet[]) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          const emailLower = user.email.toLowerCase()

          // Persist Google refresh_token so the reminders cron can send mail
          // as the user later. Supabase populates provider_refresh_token only
          // when access_type=offline + prompt=consent are set on signInWithOAuth.
          const providerRefreshToken = sessionData?.session?.provider_refresh_token
          const providerAccessToken = sessionData?.session?.provider_token
          if (providerRefreshToken) {
            const tokenClient = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            )
            await tokenClient
              .from('user_google_tokens')
              .upsert(
                {
                  user_id: user.id,
                  refresh_token: providerRefreshToken,
                  access_token: providerAccessToken ?? null,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' },
              )
          }

          // Leaders whitelist — domain-based. Anyone signing in with a
          // Google account on an allowed Workspace domain is in. The
          // `contacts` table is no longer consulted here (it remains the
          // source of truth for participant pickers etc., not for auth).
          // Dev mode still bypasses everything so local dev needs no setup.
          const skipWhitelist = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
          if (!skipWhitelist && !isLeadersEmail(user.email || '')) {
            console.warn(`[Auth] Rejected — email not on allowed domain: ${user.email}`)
            await supabase.auth.signOut()
            return NextResponse.redirect(`${origin}/login?error=not_authorized`)
          }

          // Auto-assign admin role for matching emails
          if (ADMIN_EMAILS.includes(emailLower)) {
            const serviceClient = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            )
            await serviceClient.from('users').update({ role: 'admin' }).eq('id', user.id)
            console.log(`[Auth] Auto-promoted ${user.email} to admin`)
          }
        }
      } catch (e) {
        console.error('[Auth] Post-login checks failed:', e)
      }

      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  // Return the user to login page with error
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}





