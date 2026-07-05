import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const html: string[] = d._htmlPresentation?.htmlSlides || []
const types: string[] = d._htmlPresentation?.slideTypes || []
const out = path.join(process.cwd(), '.pptx-verify', 'soltam-visual')
fs.mkdirSync(out, { recursive: true })
const browser = await getBrowser()
const results: string[] = []
for (let i = 0; i < html.length; i++) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.emulateMediaType('screen')
  await page.setContent(html[i], { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { const imgs = Array.from(document.querySelectorAll('img')); return Promise.all(imgs.map(img => (img as HTMLImageElement).complete ? Promise.resolve() : new Promise<void>(r=>{img.addEventListener('load',()=>r(),{once:true});img.addEventListener('error',()=>r(),{once:true});setTimeout(r,6000)}))) }).catch(()=>{})
  await new Promise(r => setTimeout(r, 900))
  // FIX: captureBeyondViewport:false avoids the RTL-root blank bug
  const shot = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080}, captureBeyondViewport:false }) as Buffer
  await page.close()
  const name = `s${String(i+1).padStart(2,'0')}-${(types[i]||'x').replace(/[^a-z0-9-]/gi,'')}`
  await sharp(shot).resize(1280).jpeg({ quality: 84 }).toFile(path.join(out, name+'.jpg'))
  const st = await sharp(shot).stats(); const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  // count broken images (natural size 0)
  results.push(`${name} stdev=${stdev.toFixed(0)} ${stdev<5?'⚠️BLANK':'ok'}`)
}
await browser.close()
console.log(results.join('\n'))
