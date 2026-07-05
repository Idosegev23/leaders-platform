import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { renderSlidesToImages } = await import('@/lib/playwright/pdf')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const html: string[] = (data!.data as any)._htmlPresentation?.htmlSlides || []
// production function, first 4 slides
const imgs = await renderSlidesToImages(html.slice(0,4))
for (let i=0;i<imgs.length;i++){ const st=await sharp(Buffer.from(imgs[i],'base64')).stats(); const sd=st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3; console.log(`slide${i+1} stdev=${sd.toFixed(0)} ${sd<5?'⚠️ STILL BLANK':'✅ PAINTED'}`) }
