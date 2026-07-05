import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { renderSlidesToImages } = await import('@/lib/playwright/pdf')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const html: string[] = d._htmlPresentation?.htmlSlides || []
const types: string[] = d._htmlPresentation?.slideTypes || []
console.log('slides:', html.length, '| types:', types.join(', '))
console.log('slideCritique flagged:', JSON.stringify(d._slideCritique?.flaggedCount), '/', d._slideCritique?.slideCount)
if (d._slideCritique?.slides) console.log('flagged detail:', JSON.stringify(d._slideCritique.slides).slice(0, 800))
const out = path.join(process.cwd(), '.pptx-verify', 'soltam')
fs.mkdirSync(out, { recursive: true })
const imgs = await renderSlidesToImages(html)
imgs.forEach((b64, i) => fs.writeFileSync(path.join(out, `s${String(i + 1).padStart(2, '0')}-${(types[i] || 'x').replace(/[^a-z0-9-]/gi, '')}.png`), Buffer.from(b64, 'base64')))
console.log('rendered', imgs.length, 'to', out)
