import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const raw: string = ((data!.data as any)._htmlPresentation?.htmlSlides || [])[4]
const browser = await getBrowser()
const sHead = '<head><meta charset="UTF-8"><style>.slide{width:1920px;height:1080px;position:relative;background:#f1eee9;color:#26231F;direction:rtl;}</style></head>'
const sBody = '<body><div class="slide"><h1 style="font-size:80px;padding:80px;">בדיקה TEST</h1></div></body>'
async function test(name: string, html: string) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 600))
  const buf = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080} }) as Buffer
  await page.close()
  const st = await sharp(buf).stats(); const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  console.log(`${name}\tstdev=${stdev.toFixed(1)} ${stdev<3?'⚠️ BLANK':'✅ PAINTED'}`)
}
await test('html dir=rtl lang=he ', `<!DOCTYPE html><html lang="he" dir="rtl">${sHead}${sBody}</html>`)
await test('html dir=rtl        ', `<!DOCTYPE html><html dir="rtl">${sHead}${sBody}</html>`)
await test('html lang=he        ', `<!DOCTYPE html><html lang="he">${sHead}${sBody}</html>`)
await test('html + body dir=rtl ', `<!DOCTYPE html><html>${sHead}<body dir="rtl"><div class="slide"><h1 style="font-size:80px;padding:80px;">בדיקה</h1></div></body></html>`)
// THE FIX candidate: real slide but dir moved off <html>
const fixed = raw.replace('<html lang="he" dir="rtl">', '<html lang="he">').replace('<body>', '<body dir="rtl">')
await test('FIX real (dir→body) ', fixed)
await browser.close()
