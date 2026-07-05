import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const html: string[] = (data!.data as any)._htmlPresentation?.htmlSlides || []
const browser = await getBrowser()
const PROBE = `(() => {
  const rep = function(el){ if(!el) return null; var cs=getComputedStyle(el); var r=el.getBoundingClientRect();
    return { tag:el.tagName, cls:(el.className||'').toString().slice(0,30), rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)],
      bg:cs.backgroundColor, bgImg:(cs.backgroundImage||'').slice(0,40), opacity:cs.opacity, visibility:cs.visibility, display:cs.display,
      filter:cs.filter, transform:cs.transform, clip:cs.clipPath, mixBlend:cs.mixBlendMode, zIndex:cs.zIndex, position:cs.position }; };
  var out = { html:rep(document.documentElement), body:rep(document.body) };
  var slide = document.querySelector('.slide');
  out.slide = rep(slide);
  out.children = slide ? Array.from(slide.children).map(rep) : [];
  return out;
})()`
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
await page.setContent(html[4], { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 800))
const probe = await page.evaluate(PROBE)
console.log(JSON.stringify(probe, null, 1))
await browser.close()
