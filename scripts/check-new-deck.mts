import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('createdAt:', d._htmlPresentation?.metadata?.createdAt, '| slides:', d._htmlPresentation?.htmlSlides?.length)
console.log('\n=== NEW slide arc ===')
;(d._htmlPresentation?.slideTypes||[]).forEach((t:string,i:number)=>process.stdout.write(`${i+1}:${t}  `)); console.log()
console.log('\n=== _brandAssets (acquisition) ===')
console.log('logo:', d._brandAssets?.logo?.status, d._brandAssets?.logo?.source, (d._brandAssets?.logo?.url||'').slice(0,70))
const prods = d._brandAssets?.productImages||[]
console.log('productImages:', prods.length, '| verified:', prods.filter((p:any)=>p.status==='verified').length)
for (const p of prods.slice(0,6)) console.log(`   [${p.status}] ${p.url.slice(-55)}`)
console.log('\n=== influencer slides: real photo or generated? ===')
const slides = d._agentSlides||[]
slides.forEach((s:any,i:number)=>{ if(s.slideType==='influencers'){ const u=s.content?.imageUrl||''; const kind=/\/influencers\//.test(u)?'✅ REAL PHOTO':/agent_/.test(u)?'⚠️ generated':/brand_/.test(u)?'brand':'other'; console.log(`  slide${i+1} "${(s.title||'').slice(0,32)}" key=${s.content?.keyNumber||'—'} img=${kind}`) }})
console.log('\n=== image source breakdown ===')
let real=0,agent=0,brand=0,none=0
for (const s of slides){ const u=s.content?.imageUrl||''; if(/\/influencers\//.test(u))real++; else if(/agent_/.test(u))agent++; else if(/brand_/.test(u))brand++; else if(!u)none++; }
console.log(`influencer-photo=${real} agent-generated=${agent} brand-pregenerated=${brand} no-image=${none}`)
