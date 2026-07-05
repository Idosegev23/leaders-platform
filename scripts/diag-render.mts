import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { getBrowser } = await import('@/lib/playwright/pdf')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const html: string[] = (data!.data as any)._htmlPresentation?.htmlSlides || []
const browser = await getBrowser()
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })
// deliberately DON'T wait for networkidle — just domcontentloaded, then probe
await page.setContent(html[4], { waitUntil: 'domcontentloaded' })
await new Promise(r => setTimeout(r, 1500))
const probe = await page.evaluate(() => {
  const slide = document.querySelector('.slide') as HTMLElement | null
  const r = slide?.getBoundingClientRect()
  const h1 = document.querySelector('h1') as HTMLElement | null
  const cs = slide ? getComputedStyle(slide) : null
  return {
    slideExists: !!slide,
    slideBox: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
    slideBg: cs?.backgroundColor,
    slideDisplay: cs?.display,
    bodyText: (document.body.innerText || '').slice(0, 100),
    h1Text: h1?.innerText,
    h1Box: h1 ? (() => { const b = h1.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } })() : null,
    linkCount: document.querySelectorAll('link[rel=stylesheet]').length,
  }
})
console.log(JSON.stringify(probe, null, 1))
await browser.close()
