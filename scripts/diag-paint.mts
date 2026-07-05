import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const html: string[] = (data!.data as any)._htmlPresentation?.htmlSlides || []
const browser = await getBrowser()
// string body — avoids tsx __name injection
const STYLEWAIT = `(async () => {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  await Promise.all(links.map(function(l){ return l.sheet ? Promise.resolve() : new Promise(function(res){
    var done=function(){res()}; l.addEventListener('load',done,{once:true}); l.addEventListener('error',done,{once:true}); setTimeout(done,5000);
  })}));
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch(e){}
  await new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(function(){ r(); }); }); });
})()`
async function shot(i: number, mode: string) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.setContent(html[i], { waitUntil: 'domcontentloaded' })
  if (mode === 'stylewait') { await page.evaluate(STYLEWAIT) } else { await new Promise(r => setTimeout(r, 900)) }
  const buf = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080} }) as Buffer
  await page.close()
  const st = await sharp(buf).stats()
  const mean = st.channels.slice(0,3).reduce((a,c)=>a+c.mean,0)/3
  const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  console.log(`slide${i+1} [${mode}]\tmean=${mean.toFixed(0)} stdev=${stdev.toFixed(1)} ${stdev<3?'⚠️ BLANK':'✅ PAINTED'}`)
}
for (const i of [4,5,7,12]) { await shot(i,'900ms'); await shot(i,'stylewait') }
await browser.close()
