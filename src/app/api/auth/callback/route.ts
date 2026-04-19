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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user?.email) {
          const emailLower = user.email.toLowerCase()

          // Leaders whitelist check — email must exist in `contacts`.
          // Bypassed in dev mode so local development doesn't require seeded data.
          const skipWhitelist = process.env.NEXT_PUBLIC_DEV_MODE === 'true'
          if (!skipWhitelist) {
            const serviceClient = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.SUPABASE_SERVICE_ROLE_KEY!,
            )
            const { data: contact } = await serviceClient
              .from('contacts')
              .select('id')
              .eq('email', emailLower)
              .maybeSingle()

            if (!contact) {
              console.warn(`[Auth] Rejected non-Leaders email: ${user.email}`)
              await supabase.auth.signOut()
              return NextResponse.redirect(`${origin}/login?error=not_authorized`)
            }
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





