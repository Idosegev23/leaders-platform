// src/app/api/canva/oauth/start/route.ts
import { NextResponse } from 'next/server'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/canva/oauth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Cookie holds "<state>.<verifier>" — httpOnly, short-lived, cleared on callback.
const COOKIE = 'canva_pkce'

export async function GET() {
  const verifier = generateCodeVerifier()
  const challenge = generateCodeChallenge(verifier)
  const state = generateState()

  const res = NextResponse.redirect(getAuthorizeUrl(state, challenge))
  res.cookies.set(COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min to complete the handshake
  })
  return res
}
