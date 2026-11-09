/**
 * Browser smoke test of the campaigns module against a LOCAL dev server with
 * seeded data (scripts/campaigns/seed.ts). Drives real clicks in Chrome:
 *   manager (desktop): list → campaign tabs → internal approval of a submission
 *   client (mobile):   enter via link → approve content waiting for them
 *   creator (mobile):  enter via link → upload a file → submit a version
 * Fails on page errors, 5xx responses or missing expected text.
 *
 *   CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   BASE_URL=http://localhost:3100 npx tsx scripts/campaigns/browser-smoke.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import puppeteer, { type Page } from 'puppeteer-core'
import { Pool } from 'pg'
import { assertLocal } from './db'
import { issueToken } from '../../src/lib/campaigns/portal/access'

const BASE = process.env.BASE_URL || 'http://localhost:3100'
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.env.SMOKE_OUT || path.join(tmpdir(), 'campaigns-smoke')
const dbUrl = process.env.CAMPAIGNS_DATABASE_URL || 'postgres://postgres@localhost:54329/leaders_dev'
assertLocal(dbUrl)
assertLocal(BASE)
mkdirSync(OUT, { recursive: true })

const pool = new Pool({ connectionString: dbUrl })
const problems: string[] = []
const warnings: string[] = []
const log: string[] = []
let checkpoint = 0
// a step is logged as passed only if no new problem was recorded since the last step
const step = (s: string) => {
  const ok = problems.length === checkpoint
  checkpoint = problems.length
  log.push(`${ok ? 'PASS' : 'FAIL'} ${s}`)
  console.log(ok ? '✓' : '✗', s)
}

function watch(page: Page, who: string) {
  page.on('pageerror', (e) => problems.push(`[${who}] page error: ${(e as Error).message}`))
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${who}] ${r.status()} ${r.url()}`) })
  page.on('console', (m) => {
    if (m.type() !== 'error' || /favicon|Failed to load resource.*(401|404)/.test(m.text())) return
    // dev-server noise: a prefetch aborted by our own full-page navigation after login
    if (/Failed to fetch RSC payload.*Falling back to browser navigation/.test(m.text())) { warnings.push(`[${who}] ${m.text().slice(0, 120)}`); return }
    problems.push(`[${who}] console: ${m.text().slice(0, 200)}`)
  })
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true })
}

async function expectText(page: Page, text: string, who: string) {
  const ok = await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: 20_000 }, text).then(() => true).catch(() => false)
  if (!ok) problems.push(`[${who}] expected text not found: "${text}" on ${page.url()}`)
  return ok
}

async function clickText(page: Page, text: string, selector = 'button, a') {
  // exact text first, then contains; disabled controls are skipped
  const handle = await page.waitForFunction((t, sel) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((e) => !(e as HTMLButtonElement).disabled)
    return els.find((e) => e.innerText.trim() === t) ?? els.find((e) => e.innerText.trim().includes(t))
  }, { timeout: 20_000 }, text, selector)
  await (handle.asElement() as unknown as { click(): Promise<void> }).click()
}

async function freshLink(recipient: string, next?: string) {
  const g = await pool.query(`select id from cm_portal_grants where recipient_name = $1 and status = 'active' limit 1`, [recipient])
  if (!g.rows[0]) throw new Error(`no grant for ${recipient}`)
  const { token } = await issueToken(pool, g.rows[0].id, 'login', new Date(), null)
  return `${BASE}/portal/enter#t=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=he-IL'] })
  try {
    // ── Manager, desktop ──────────────────────────────────────────────────
    const ctxM = await browser.createBrowserContext()
    const m = await ctxM.newPage()
    watch(m, 'manager')
    await m.setViewport({ width: 1366, height: 900 })
    await m.goto(`${BASE}/campaigns`, { waitUntil: 'networkidle2' })
    await expectText(m, 'כניסת פיתוח מקומית', 'manager')
    await clickText(m, 'נועה כהן')
    await m.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    await expectText(m, 'אדידס Ultraboost', 'manager')
    await shot(m, '01-manager-campaigns-desktop')
    step('manager signed in (dev login) and sees the campaign list')

    const campaignId = (await pool.query(`select id from cm_campaigns where name like 'אדידס%'`)).rows[0].id
    for (const [tab, text] of [['overview', 'מה דורש פעולה עכשיו'], ['creators', 'משתתפים'], ['deliverables', 'ממתין ל'], ['tasks', 'לוח זמנים'], ['budget', 'יתרה זמינה'], ['report', 'איך חושב'], ['activity', 'היסטוריית פעולות'], ['access', 'הזמנות לפורטל']]) {
      await m.goto(`${BASE}/campaigns/${campaignId}?tab=${tab}`, { waitUntil: 'networkidle2' })
      await expectText(m, text, `manager/${tab}`)
      await shot(m, `02-manager-tab-${tab}`)
    }
    step('all 8 campaign tabs render with live data')

    // internal approval of the submitted "ריל סטייל"
    const d3 = (await pool.query(`select id from cm_deliverables where title = 'ריל סטייל'`)).rows[0].id
    await m.goto(`${BASE}/campaigns/${campaignId}/deliverables/${d3}`, { waitUntil: 'networkidle2' })
    await expectText(m, 'שלב 1 · אישור פנימי', 'manager')
    await shot(m, '03-manager-deliverable-before')
    await clickText(m, 'אישור פנימי ושליחה ללקוח')
    await expectText(m, 'אושר פנימית — ממתין לאישור הלקוח', 'manager')
    await shot(m, '04-manager-deliverable-after-internal-approval')
    const st = (await pool.query(`select status from cm_deliverables where id = $1`, [d3])).rows[0].status
    if (st !== 'client_review') problems.push(`[manager] expected client_review after approval, got ${st}`)
    else step('manager approved a version internally in the browser → client_review')

    await m.goto(`${BASE}/campaigns/${campaignId}/report/print`, { waitUntil: 'networkidle2' })
    await expectText(m, 'דוח סיכום', 'manager')
    await shot(m, '05-manager-report-print')
    const csv = await m.evaluate(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return { status: r.status, type: r.headers.get('content-type'), bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf } }, `${BASE}/api/campaigns/${campaignId}/report/csv`)
    if (csv.status !== 200 || !csv.type?.includes('text/csv') || !csv.bom) problems.push(`[manager] CSV export bad: ${JSON.stringify(csv)}`)
    else step('CSV export downloads with BOM and text/csv')

    // manager at mobile width
    await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await m.goto(`${BASE}/campaigns`, { waitUntil: 'networkidle2' })
    await shot(m, '06-manager-campaigns-mobile')
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 2) problems.push(`[manager/mobile] horizontal overflow ${overflow}px`)
    step('manager list at 390px width')

    // ── Client, mobile ────────────────────────────────────────────────────
    const ctxC = await browser.createBrowserContext()
    const c = await ctxC.newPage()
    watch(c, 'client')
    await c.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await c.goto(await freshLink('רונית (אדידס) — בדיקה'), { waitUntil: 'networkidle2' })
    if (c.url().includes('#t=')) problems.push('[client] token still in address bar')
    await expectText(c, 'כניסה לפורטל הקמפיין', 'client')
    await clickText(c, 'כניסה', 'button')
    await c.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    await expectText(c, 'תכנים ממתינים להחלטתך', 'client')
    const body = await c.evaluate(() => document.body.innerText)
    if (/12,000|9,500|מחיר כולל שימוש|₪/.test(body)) problems.push('[client] internal price/notes visible in client portal')
    await shot(c, '07-client-home-mobile')
    step('client entered via single-use link; no fees or internal notes on the page')
    await clickText(c, 'לצפייה ואישור')
    await c.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    await expectText(c, 'ממתינה לאישורך', 'client')
    await shot(c, '08-client-deliverable-mobile')
    await clickText(c, 'אישור התוכן')
    await expectText(c, 'אין החלטה ממתינה', 'client')
    await shot(c, '09-client-after-approval')
    step('client approved the current version from a phone-sized screen')
    const overflowC = await c.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflowC > 2) problems.push(`[client/mobile] horizontal overflow ${overflowC}px`)

    // reusing the same link must fail
    const used = await freshLink('רונית (אדידס) — בדיקה')
    const c2 = await (await browser.createBrowserContext()).newPage()
    await c2.goto(used, { waitUntil: 'networkidle2' })
    await clickText(c2, 'כניסה', 'button')
    await c2.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    const c3 = await (await browser.createBrowserContext()).newPage()
    await c3.goto(used.replace('#t=', '#t='), { waitUntil: 'networkidle2' })
    await clickText(c3, 'כניסה', 'button')
    await expectText(c3, 'הקישור אינו בתוקף', 'client/reuse')
    await shot(c3, '10-link-reuse-refused')
    step('a used link is refused with a clear message')

    // ── Creator, mobile ───────────────────────────────────────────────────
    const ctxK = await browser.createBrowserContext()
    const k = await ctxK.newPage()
    watch(k, 'creator')
    await k.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    await k.goto(await freshLink('איתי מבשל — בדיקה'), { waitUntil: 'networkidle2' })
    await clickText(k, 'כניסה', 'button')
    await k.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
    await expectText(k, 'מה נדרש ממך', 'creator')
    await shot(k, '11-creator-home-mobile')
    const d4 = (await pool.query(`select id from cm_deliverables where title = 'ריל בישול אחרי ריצה'`)).rows[0].id
    await k.goto(`${BASE}/portal/deliverables/${d4}`, { waitUntil: 'networkidle2' })
    await expectText(k, 'צריך להראות את הנעל', 'creator')
    const png = path.join(OUT, 'upload.png')
    writeFileSync(png, Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex'))
    const input = await k.waitForSelector('input[type=file]')
    await (input as unknown as { uploadFile(p: string): Promise<void> }).uploadFile(png)
    await expectText(k, 'הועלה ואומת', 'creator')
    await clickText(k, 'הגשה')
    await expectText(k, 'גרסה 2', 'creator')
    await shot(k, '12-creator-after-submit')
    const v = (await pool.query(`select status, (select max(version_number) from cm_content_versions where deliverable_id = $1) as n from cm_deliverables where id = $1`, [d4])).rows[0]
    if (v.status !== 'submitted' || v.n !== 2) problems.push(`[creator] expected submitted v2, got ${JSON.stringify(v)}`)
    else step('creator uploaded a file (direct upload + verify) and submitted version 2')

    // creator cannot open another creator's deliverable
    const other = (await pool.query(`select id from cm_deliverables where title = 'ריל השקה'`)).rows[0].id
    const res = await k.goto(`${BASE}/portal/deliverables/${other}`, { waitUntil: 'networkidle2' })
    await expectText(k, 'הדף לא נמצא', 'creator/url-tamper')
    step(`creator changing the URL to another creator's deliverable gets "not found" (HTTP ${res?.status()})`)
  } finally {
    await browser.close()
    await pool.end()
  }
  writeFileSync(path.join(OUT, 'result.txt'), [...log, '', 'PROBLEMS:', ...problems, '', 'WARNINGS:', ...warnings].join('\n'))
  if (warnings.length) console.log('warnings (not failures):\n' + warnings.join('\n'))
  console.log(`\nscreenshots: ${OUT}`)
  if (problems.length) {
    console.error('PROBLEMS:\n' + problems.join('\n'))
    process.exit(1)
  }
  console.log('SMOKE OK')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); console.error('PROBLEMS SO FAR:\n' + problems.join('\n')); process.exit(1) })
