/**
 * Phase 6 — end-to-end Soltam regen on the upgraded engine.
 * 1) regenerate the blueprint (fresh expanded arc)
 * 2) generate-full with useBlueprint (acquisition + reference images + real photos)
 * Uses the internal-secret server-to-server trigger. Prints timings.
 */
import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }

const BASE = process.env.REGEN_BASE_URL || 'https://leaders-platform.vercel.app'
const SECRET = process.env.LEADS_TRIGGER_SECRET || ''
const DOC = process.env.REGEN_DOC_ID || '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc'
if (!SECRET) { console.error('LEADS_TRIGGER_SECRET missing'); process.exit(1) }
const headers = { 'content-type': 'application/json', 'x-internal-secret': SECRET }

async function post(pathname: string, body: Record<string, unknown>, timeoutMs = 850_000) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}${pathname}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) })
  const txt = await res.text()
  let json: unknown = txt; try { json = JSON.parse(txt) } catch {}
  return { status: res.status, ms: Date.now() - t0, json }
}

console.log(`▶ base=${BASE} doc=${DOC}`)
console.log('① regenerating blueprint (fresh expanded arc)...')
const bp = await post('/api/generate-blueprint', { documentId: DOC, regenerate: true })
console.log(`   → ${bp.status} in ${(bp.ms/1000).toFixed(0)}s`, JSON.stringify(bp.json).slice(0, 240))
if (bp.status !== 200) { console.error('blueprint failed — stopping'); process.exit(1) }

console.log('② generate-full (acquisition + reference images + real photos)...')
const full = await post('/api/generate-full', { documentId: DOC, useBlueprint: true })
console.log(`   → ${full.status} in ${(full.ms/1000).toFixed(0)}s`, JSON.stringify(full.json).slice(0, 400))
