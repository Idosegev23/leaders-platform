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
async function test(name: string, html: string, opts: any = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 700))
  const buf = await page.screenshot({ type:'png', ...opts }) as Buffer
  await page.close()
  const st = await sharp(buf).stats(); const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  console.log(`${name}\tstdev=${stdev.toFixed(1)} ${stdev<3?'⚠️ BLANK':'✅ PAINTED'}`)
}
// strip dir="rtl" attribute entirely (keep CSS direction:rtl on .slide)
const stripped = raw.replace(/\sdir="rtl"/gi, '')
await test('as-is  clip        ', raw, { clip:{x:0,y:0,width:1920,height:1080} })
await test('as-is  no-clip     ', raw, {})
await test('as-is  beyondVP=f  ', raw, { clip:{x:0,y:0,width:1920,height:1080}, captureBeyondViewport:false })
await test('STRIP-dir clip     ', stripped, { clip:{x:0,y:0,width:1920,height:1080} })
await test('STRIP-dir no-clip  ', stripped, {})
await browser.close()
