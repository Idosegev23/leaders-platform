import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('_brandAssets exists:', '_brandAssets' in d, '| value:', JSON.stringify(d._brandAssets))
console.log('_scraped exists:', '_scraped' in d, '| logoUrl:', d._scraped?.logoUrl)
console.log('enhancedInfluencers[0].name (raw cache):', d.enhancedInfluencers?.[0]?.name)
// what are the influencer slide images ("other")?
const inf = (d._agentSlides||[]).filter((s:any)=>s.slideType==='influencers')
for (const s of inf) console.log(`  ${s.title?.slice(0,30)} -> ${(s.content?.imageUrl||'(none)').slice(-60)}`)
