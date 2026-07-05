import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const { renderAgentSlide, pickPersona } = await import('@/lib/gemini/slide-personas')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const persona = pickPersona('סולתם')
const infSlides = (d._agentSlides||[]).map((s:any,i:number)=>({s,i})).filter((x:any)=>x.s.slideType==='influencers')
const out = path.join(process.cwd(),'.pptx-verify','avatars'); fs.mkdirSync(out,{recursive:true})
const browser = await getBrowser()
for (const {s,i} of infSlides.slice(0,3)) {
  const html = renderAgentSlide({ ...s.content, slideType: s.slideType, title: s.title }, { persona, slideIndex: i, brandName: 'סולתם' })
  const page = await browser.newPage(); await page.setViewport({width:1920,height:1080,deviceScaleFactor:1})
  await page.setContent(html,{waitUntil:'domcontentloaded'})
  await page.evaluate(()=>{const im=document.querySelectorAll('img');return Promise.all(Array.from(im).map(x=>(x as HTMLImageElement).complete?0:new Promise<void>(r=>{x.addEventListener('load',()=>r());x.addEventListener('error',()=>r());setTimeout(r,6000)})))}).catch(()=>{})
  await new Promise(r=>setTimeout(r,900))
  const buf = await page.screenshot({type:'png',clip:{x:0,y:0,width:1920,height:1080},captureBeyondViewport:false}) as Buffer
  await page.close()
  await sharp(buf).resize(1280).jpeg({quality:86}).toFile(path.join(out,`inf-${i+1}.jpg`))
}
await browser.close(); console.log('rendered', infSlides.length, 'influencer slides ->', out)
