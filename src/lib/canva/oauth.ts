// src/lib/canva/oauth.ts
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

/**
 * Canva Connect OAuth (single connected service account).
 *
 * Endpoints (verbatim from the Canva Connect API):
 *   authorize : GET  https://www.canva.com/api/oauth/authorize
 *   token     : POST https://api.canva.com/rest/v1/oauth/token
 *               (Authorization: Basic base64(client_id:client_secret),
 *                Content-Type: application/x-www-form-urlencoded)
 *
 * Access token TTL is 14400s. The refresh token is single-use / rotating —
 * every refresh returns a NEW refresh_token that we MUST persist, or the next
 * refresh 400s. getValidAccessToken() handles that rotation.
 */

const AUTHORIZE_URL = 'https://www.canva.com/api/oauth/authorize'
const TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token'
const DEFAULT_SCOPES = 'design:content:write design:meta:read design:content:read'
// Refresh a bit early so an in-flight import never races the 14400s expiry.
const EXPIRY_SKEW_MS = 60_000

export interface CanvaTokenResponse {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number // seconds — 14400
  scope?: string
}

function clientId(): string {
  const v = process.env.CANVA_CLIENT_ID
  if (!v) throw new Error('CANVA_CLIENT_ID is not set')
  return v
}
function clientSecret(): string {
  const v = process.env.CANVA_CLIENT_SECRET
  if (!v) throw new Error('CANVA_CLIENT_SECRET is not set')
  return v
}
function redirectUri(): string {
  return (
    process.env.CANVA_REDIRECT_URI ||
    'https://leaders-platform.vercel.app/api/canva/oauth/callback'
  )
}
function scopes(): string {
  return process.env.CANVA_SCOPES || DEFAULT_SCOPES
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

/* ---------------- PKCE helpers (S256) ---------------- */

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** code_verifier = base64url(randomBytes(96)) per the shared contract. */
export function generateCodeVerifier(): string {
  return b64url(crypto.randomBytes(96))
}

/** code_challenge = base64url(sha256(verifier)). */
export function generateCodeChallenge(verifier: string): string {
  return b64url(crypto.createHash('sha256').update(verifier).digest())
}

export function generateState(): string {
  return b64url(crypto.randomBytes(24))
}

/* ---------------- Authorize ---------------- */

export function getAuthorizeUrl(state: string, codeChallenge: string): string {
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId())
  u.searchParams.set('redirect_uri', redirectUri())
  u.searchParams.set('scope', scopes())
  u.searchParams.set('state', state)
  u.searchParams.set('code_challenge', codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  // URLSearchParams encodes spaces in `scope` as '+'. Canva's authorize
  // endpoint follows the RFC-3986 convention and expects '%20' — some strict
  // parsers reject '+' as part of the scope value (invalid_scope). The other
  // params are '+' -free (base64url uses -/_ ; redirect_uri is percent-encoded),
  // so a global '+' -> '%20' swap is safe here.
  return u.toString().replace(/\+/g, '%20')
}

/* ---------------- Token endpoint ---------------- */

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64')
}

async function postToken(params: Record<string, string>): Promise<CanvaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Canva token ${res.status}: ${text.slice(0, 400)}`)
  }
  return JSON.parse(text) as CanvaTokenResponse
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
): Promise<CanvaTokenResponse> {
  return postToken({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri(),
  })
}

/**
 * Persist a token response as the single canva_tokens row. We keep exactly
 * one row (single connected service account) — upsert onto the newest id or
 * insert the first row.
 */
export async function persistTokens(
  tokens: CanvaTokenResponse,
  accountEmail?: string | null,
): Promise<void> {
  const sb = service()
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()
  const { data: existing } = await sb
    .from('canva_tokens')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const row = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_token_expires_at: expiresAt,
    ...(accountEmail !== undefined ? { account_email: accountEmail } : {}),
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error } = await sb.from('canva_tokens').update(row).eq('id', existing.id)
    if (error) throw new Error(`persistTokens update failed: ${error.message}`)
  } else {
    const { error } = await sb.from('canva_tokens').insert(row)
    if (error) throw new Error(`persistTokens insert failed: ${error.message}`)
  }
}

/**
 * Return a currently-valid access token, refreshing (and rotating the
 * single-use refresh_token) if the stored one is expired/near-expiry.
 */
export async function getValidAccessToken(): Promise<string> {
  const sb = service()
  const { data: rowData, error } = await sb
    .from('canva_tokens')
    .select('id, refresh_token, access_token, access_token_expires_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`canva_tokens read failed: ${error.message}`)
  if (!rowData) {
    throw new Error('Canva is not connected — visit /api/canva/oauth/start first')
  }

  const notExpired =
    rowData.access_token &&
    rowData.access_token_expires_at &&
    new Date(rowData.access_token_expires_at).getTime() - EXPIRY_SKEW_MS > Date.now()
  if (notExpired) return rowData.access_token as string

  // Refresh. Canva rotates the refresh_token — persist the NEW one.
  // Concurrency: canva_tokens is ONE shared service-account row, so two requests
  // can hit an expired token simultaneously. Whoever refreshes first consumes the
  // single-use refresh_token; the loser's refresh then 400s. On failure we re-read
  // the row and reuse the freshly-persisted token from the winner instead of
  // failing the whole import (self-healing, no lock needed).
  let refreshed: CanvaTokenResponse
  try {
    refreshed = await postToken({
      grant_type: 'refresh_token',
      refresh_token: rowData.refresh_token as string,
    })
  } catch (refreshErr) {
    const { data: reread } = await sb
      .from('canva_tokens')
      .select('access_token, access_token_expires_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const winnerValid =
      reread?.access_token &&
      reread.access_token_expires_at &&
      new Date(reread.access_token_expires_at).getTime() - EXPIRY_SKEW_MS > Date.now()
    if (winnerValid) return reread!.access_token as string
    throw refreshErr
  }
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
  const { error: upErr } = await sb
    .from('canva_tokens')
    .update({
      refresh_token: refreshed.refresh_token,
      access_token: refreshed.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', rowData.id)
  if (upErr) throw new Error(`canva_tokens rotate failed: ${upErr.message}`)
  return refreshed.access_token
}
