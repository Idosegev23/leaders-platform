import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const html: string[] = d._htmlPresentation?.htmlSlides || []
const types: string[] = d._htmlPresentation?.slideTypes || []
const out = path.join(process.cwd(), '.pptx-verify', 'soltam-v5'); fs.mkdirSync(out, { recursive: true })
const browser = await getBrowser()
for (let i=0;i<html.length;i++){
  const page = await browser.newPage()
  await page.setViewport({ width:1920, height:1080, deviceScaleFactor:1 })
  await page.setContent(html[i], { waitUntil:'domcontentloaded' })
  await page.evaluate(()=>{const imgs=Array.from(document.querySelectorAll('img'));return Promise.all(imgs.map(im=>(im as HTMLImageElement).complete?0:new Promise<void>(r=>{im.addEventListener('load',()=>r(),{once:true});im.addEventListener('error',()=>r(),{once:true});setTimeout(r,6000)})))}).catch(()=>{})
  await new Promise(r=>setTimeout(r,900))
  const buf = await page.screenshot({type:'png',clip:{x:0,y:0,width:1920,height:1080},captureBeyondViewport:false}) as Buffer
  await page.close()
  await sharp(buf).resize(1280).jpeg({quality:84}).toFile(path.join(out,`s${String(i+1).padStart(2,'0')}-${(types[i]||'x').replace(/[^a-z0-9-]/gi,'')}.jpg`))
}
await browser.close(); console.log('rendered', html.length, 'to', out)
