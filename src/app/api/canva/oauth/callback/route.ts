// src/app/api/canva/oauth/callback/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeCodeForToken, persistTokens } from '@/lib/canva/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const COOKIE = 'canva_pkce'

function appBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'https://leaders-platform.vercel.app'
}

export async function GET(request: Request) {
  const base = appBaseUrl()
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const cookieStore = await cookies()
  const stash = cookieStore.get(COOKIE)?.value

  const fail = (reason: string) => {
    console.warn('[canva-callback]', reason)
    const res = NextResponse.redirect(`${base}/dashboard?canva=error`)
    res.cookies.delete(COOKIE)
    return res
  }

  if (!code || !state) return fail('missing code/state')
  if (!stash) return fail('missing pkce cookie')

  const sep = stash.indexOf('.')
  const cookieState = sep === -1 ? '' : stash.slice(0, sep)
  const verifier = sep === -1 ? '' : stash.slice(sep + 1)
  if (!cookieState || !verifier || cookieState !== state) {
    return fail('state mismatch')
  }

  try {
    const tokens = await exchangeCodeForToken(code, verifier)
    await persistTokens(tokens)
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }

  const res = NextResponse.redirect(`${base}/dashboard?canva=connected`)
  res.cookies.delete(COOKIE)
  return res
}
