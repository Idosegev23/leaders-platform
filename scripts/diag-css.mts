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
async function test(name: string, html: string) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 700))
  const buf = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080} }) as Buffer
  await page.close()
  const st = await sharp(buf).stats(); const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  const [r,g,b]=st.channels.slice(0,3).map(c=>Math.round(c.mean))
  console.log(`${name}\tRGB(${r},${g},${b}) stdev=${stdev.toFixed(1)} ${stdev<3?'⚠️ BLANK':'✅ PAINTED'}`)
}
await test('raw            ', raw)
await test('no-textwrap    ', raw.replace(/text-wrap:balance;?/g,''))
await test('no-lineclamp   ', raw.replace(/display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:\d+;?/g,''))
await test('no-h123overflow', raw.replace(/h1,h2,h3\{overflow:hidden;[^}]*\}/g,''))
await test('no-slideOvflow ', raw.replace(/(\.slide\{[^}]*?)overflow:hidden;/,'$1'))
await test('no-star-reset  ', raw.replace(/\*\{margin:0;padding:0;box-sizing:border-box;\}/,''))
await test('no-webkitbox-p ', raw.replace(/[hpli0-9, ]*\{overflow:hidden;display:-webkit-box;[^}]*\}/g,''))
await browser.close()
