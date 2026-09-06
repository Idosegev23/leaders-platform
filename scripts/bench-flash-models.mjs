/**
 * Flash-model benchmark for the Leaders deck pipeline.
 *
 * The codebase pins `gemini-3.5-flash` in 39 places. Three newer flash
 * generations now exist (3.6 / 3.7 / 3.8) with identical published limits,
 * so the question is not "can we swap" but "does it actually get better".
 *
 * Two tasks, both lifted from what this app really does with flash:
 *
 *   A. HEBREW JSON  — the /api/brand-quick-info prompt verbatim. Flash's most
 *      common shape here: Hebrew copy returned as strict JSON. Graded on JSON
 *      validity, the requested item count, and how much of the text is
 *      actually Hebrew (models drift to English on Hebrew brand prompts).
 *
 *   B. GROUNDED DOMAIN — resolve a brand's official site with googleSearch.
 *      This is the exact capability the brand-asset fix needs, and it is
 *      objectively gradeable: known brands are checked against the expected
 *      domain, and every answer is HTTP-probed so a hallucinated domain is
 *      caught even when we have no ground truth.
 *
 * Usage: node scripts/bench-flash-models.mjs
 * Requires GEMINI_API_KEY (read from .env.local).
 */

import { readFileSync } from 'fs'
import { GoogleGenAI } from '@google/genai'

// ─── env ──────────────────────────────────────────────────────────

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    const hit = env.match(/^GEMINI_API_KEY=(.*)$/m)
    return hit?.[1]?.trim().replace(/^["']|["']$/g, '')
  } catch {
    return undefined
  }
}

const apiKey = loadKey()
if (!apiKey) {
  console.error('GEMINI_API_KEY not found (env or .env.local)')
  process.exit(1)
}
const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 120_000 } })

const MODELS = [
  'gemini-3.5-flash', // current pin
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
]

// ─── task A: Hebrew JSON (brand-quick-info, verbatim prompt) ──────

const JSON_BRANDS = ['SEACRET SPA', 'SodaStream', 'Fiverr']

const hebrewFactsPrompt = (brandName) =>
  `אתה חוקר מותגים. ספק 5 עובדות מעניינות וקצרות על המותג "${brandName}".
כל עובדה צריכה להיות משפט אחד בעברית.
התמקד ב: היסטוריה, הישגים, קהל יעד, נוכחות דיגיטלית, קמפיינים בולטים.
אם אתה לא מכיר את המותג, כתוב עובדות כלליות על התעשייה.

החזר JSON בפורמט: { "facts": ["עובדה 1", "עובדה 2", ...] }`

/** Share of letter characters that are Hebrew — catches drift to English. */
function hebrewRatio(text) {
  const letters = (text.match(/\p{L}/gu) || []).length
  if (!letters) return 0
  const hebrew = (text.match(/[֐-׿]/g) || []).length
  return hebrew / letters
}

async function taskHebrewJson(model, brand) {
  const started = Date.now()
  const res = await ai.models.generateContent({
    model,
    contents: hebrewFactsPrompt(brand),
    config: { responseMimeType: 'application/json' },
  })
  const ms = Date.now() - started
  const text = res.text || ''
  const usage = res.usageMetadata || {}

  let facts = null
  let valid = false
  try {
    facts = JSON.parse(text).facts
    valid = Array.isArray(facts)
  } catch {
    /* invalid JSON is itself the finding */
  }

  return {
    ms,
    valid,
    count: valid ? facts.length : 0,
    hebrew: valid ? hebrewRatio(facts.join(' ')) : 0,
    outTokens: usage.candidatesTokenCount ?? 0,
    thoughtTokens: usage.thoughtsTokenCount ?? 0,
  }
}

// ─── task B: grounded domain resolution ───────────────────────────

// `expected` is null where we have no confident ground truth — those rows are
// graded on live reachability only, and reported for eyeballing.
const DOMAIN_CASES = [
  { brand: 'SodaStream', expected: 'sodastream.com' },
  { brand: 'Fiverr', expected: 'fiverr.com' },
  { brand: 'Wix', expected: 'wix.com' },
  { brand: 'Coca-Cola', expected: 'coca-cola.com' },
  { brand: 'SEACRET SPA', expected: null }, // the real pipeline case
]

const domainPrompt = (brand) =>
  `What is the official website of the brand "${brand}"?
Search the web to confirm. Answer with ONLY the bare domain, lowercase, no scheme and no www (example: nike.com).
If you genuinely cannot find it, answer exactly: UNKNOWN`

function cleanDomain(raw) {
  const t = (raw || '').trim().toLowerCase()
  if (!t || t.includes('unknown')) return null
  const m = t.match(/([a-z0-9-]+\.)+[a-z]{2,}/)
  return m ? m[0].replace(/^www\./, '') : null
}

/** A hallucinated domain usually fails to answer at all — probe it. */
async function isLive(domain) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(`https://${domain}`, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
      })
      if (r.body) void r.body.cancel().catch(() => {})
      if (r.status < 500) return true
    } catch {
      /* try next method, then give up */
    }
  }
  return false
}

async function taskDomain(model, brand) {
  const started = Date.now()
  const res = await ai.models.generateContent({
    model,
    contents: domainPrompt(brand),
    config: { tools: [{ googleSearch: {} }] },
  })
  const ms = Date.now() - started
  const domain = cleanDomain(res.text)
  return { ms, domain, live: domain ? await isLive(domain) : false }
}

// ─── runner ───────────────────────────────────────────────────────

const pct = (n) => `${Math.round(n * 100)}%`
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

async function main() {
  console.log(`Flash benchmark — ${MODELS.length} models\n`)
  const summary = {}

  for (const model of MODELS) {
    console.log(`\n═══ ${model} ═══`)
    const row = { jsonMs: [], hebrew: [], valid: 0, jsonRuns: 0, domMs: [], hits: 0, live: 0, domRuns: 0, errors: 0 }

    for (const brand of JSON_BRANDS) {
      try {
        const r = await taskHebrewJson(model, brand)
        row.jsonRuns++
        row.jsonMs.push(r.ms)
        row.hebrew.push(r.hebrew)
        if (r.valid && r.count === 5) row.valid++
        console.log(
          `  [JSON] ${brand.padEnd(12)} ${String(r.ms).padStart(6)}ms  json=${r.valid ? 'ok' : 'BAD'} facts=${r.count} he=${pct(r.hebrew)} out=${r.outTokens} think=${r.thoughtTokens}`,
        )
      } catch (e) {
        row.errors++
        console.log(`  [JSON] ${brand.padEnd(12)} ERROR ${String(e?.message).slice(0, 80)}`)
      }
    }

    for (const { brand, expected } of DOMAIN_CASES) {
      try {
        const r = await taskDomain(model, brand)
        row.domRuns++
        row.domMs.push(r.ms)
        if (r.live) row.live++
        const graded = expected ? (r.domain === expected ? 'HIT' : 'MISS') : '—'
        if (expected && r.domain === expected) row.hits++
        console.log(
          `  [DOM ] ${brand.padEnd(12)} ${String(r.ms).padStart(6)}ms  ${String(r.domain).padEnd(22)} live=${r.live ? 'y' : 'n'} ${graded}`,
        )
      } catch (e) {
        row.errors++
        console.log(`  [DOM ] ${brand.padEnd(12)} ERROR ${String(e?.message).slice(0, 80)}`)
      }
    }

    summary[model] = row
  }

  const known = DOMAIN_CASES.filter((c) => c.expected).length
  console.log('\n\n════════════════ SUMMARY ════════════════')
  console.log(
    'model'.padEnd(20) +
      'json ms'.padStart(9) +
      'json ok'.padStart(9) +
      'hebrew'.padStart(8) +
      'dom ms'.padStart(9) +
      'accuracy'.padStart(10) +
      'live'.padStart(7) +
      'err'.padStart(5),
  )
  for (const [model, r] of Object.entries(summary)) {
    console.log(
      model.padEnd(20) +
        String(Math.round(avg(r.jsonMs))).padStart(9) +
        `${r.valid}/${r.jsonRuns}`.padStart(9) +
        pct(avg(r.hebrew)).padStart(8) +
        String(Math.round(avg(r.domMs))).padStart(9) +
        `${r.hits}/${known}`.padStart(10) +
        `${r.live}/${r.domRuns}`.padStart(7) +
        String(r.errors).padStart(5),
    )
  }
  console.log('\njson ok = valid JSON with exactly 5 facts | accuracy = exact domain match on known brands')
  console.log('live    = returned domain answers over HTTPS (catches hallucinated domains)')
}

main().catch((e) => {
  console.error('benchmark failed:', e)
  process.exit(1)
})
