/**
 * Development-only stand-in for signed storage URLs (CAMPAIGNS_STORAGE=local).
 * Returns 404 in production and whenever Supabase storage is configured.
 */
import { type NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import { getStorage } from '@/lib/campaigns/runtime'
import { LocalStorage } from '@/lib/campaigns/storage/local'
import { MIME_RULES, maxBytesFor } from '@/lib/campaigns/storage/provider'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function local(): LocalStorage | null {
  if (process.env.NODE_ENV === 'production') return null
  const s = getStorage()
  return s instanceof LocalStorage ? s : null
}

function check(req: NextRequest, op: 'put' | 'get') {
  const s = local()
  const q = new URL(req.url).searchParams
  const key = q.get('key') ?? ''
  if (!s || q.get('op') !== op || !s.verify(op, key, Number(q.get('exp')), q.get('sig') ?? '')) return null
  return { s, key, name: q.get('name') }
}

export async function PUT(req: NextRequest) {
  const c = check(req, 'put')
  if (!c) return new Response('forbidden', { status: 403 })
  const type = req.headers.get('content-type') ?? ''
  const rule = MIME_RULES[type]
  if (!rule) return new Response('unsupported type', { status: 415 })
  const buf = Buffer.from(await req.arrayBuffer())
  if (buf.length > maxBytesFor(rule.kind)) return new Response('too large', { status: 413 })
  await c.s.write(c.key, buf, type)
  return new Response(null, { status: 200 })
}

export async function GET(req: NextRequest) {
  const c = check(req, 'get')
  if (!c) return new Response('forbidden', { status: 403 })
  const info = await c.s.stat(c.key)
  if (!info) return new Response('not found', { status: 404 })
  const body = await readFile(c.s.filePath(c.key))
  return new Response(body, {
    headers: {
      'content-type': info.contentType ?? 'application/octet-stream',
      'cache-control': 'private, no-store',
      'content-disposition': c.name ? `inline; filename*=UTF-8''${encodeURIComponent(c.name)}` : 'inline',
      'x-content-type-options': 'nosniff',
    },
  })
}
