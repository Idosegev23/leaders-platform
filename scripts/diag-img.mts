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
async function test(name: string, html: string, waitUntil: any, ms: number) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  try { await page.setContent(html, { waitUntil, timeout: 15000 }) } catch(e){ console.log(name,'setContent threw:', (e as Error).message.slice(0,60)) }
  await new Promise(r => setTimeout(r, ms))
  const buf = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080} }) as Buffer
  await page.close()
  const st = await sharp(buf).stats()
  const [r,g,b] = st.channels.slice(0,3).map(c=>Math.round(c.mean))
  const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  console.log(`${name}\tRGB(${r},${g},${b}) stdev=${stdev.toFixed(1)} ${stdev<3?'⚠️ BLANK':'✅ painted'}`)
}
const noImg = raw.replace(/<img[^>]*>/gi, '')
const noSvg = raw.replace(/<img[^>]*new_logo\.svg[^>]*>/gi, '')
const noSupa = raw.replace(/<img[^>]*supabase[^>]*>/gi, '')
await test('asis-dom-800  ', raw, 'domcontentloaded', 800)
await test('asis-dom-5000 ', raw, 'domcontentloaded', 5000)
await test('asis-load-1000', raw, 'load', 1000)
await test('NO-IMG-800    ', noImg, 'domcontentloaded', 800)
await test('NO-SVGlogo-800', noSvg, 'domcontentloaded', 800)
await test('NO-supaImg-800', noSupa, 'domcontentloaded', 800)
await browser.close()
