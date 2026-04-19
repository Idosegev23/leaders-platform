import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Dev mode bypass - skip authentication in development
const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true'

export async function updateSession(request: NextRequest) {
  // In dev mode, allow all routes without authentication (blocked in production by dev-mode.ts)
  if (isDevMode && process.env.NODE_ENV !== 'production') {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Helper: create a redirect that preserves session cookies
  function redirectWithSession(url: URL): NextResponse {
    const redirect = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie.name, cookie.value, cookie)
    })
    return redirect
  }

  // Protected routes
  const protectedPaths = ['/dashboard', '/admin', '/create', '/documents', '/preview', '/create-proposal', '/wizard', '/research', '/generate', '/edit']
  const isProtectedPath = protectedPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  // Admin-only routes
  const adminPaths = ['/admin']
  const isAdminPath = adminPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    // Redirect to login if not authenticated
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', request.nextUrl.pathname)
    return redirectWithSession(url)
  }

  if (isAdminPath && user) {
    // Check if user is admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userData?.role !== 'admin') {
      // Redirect non-admins to dashboard
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return redirectWithSession(url)
    }
  }

  // Redirect authenticated users away from login page
  if (request.nextUrl.pathname === '/login' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithSession(url)
  }

  return supabaseResponse
}

