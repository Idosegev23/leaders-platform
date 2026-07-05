import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('=== enhancedInfluencers (real enrichment) ===')
for (const inf of (d.enhancedInfluencers||[])) console.log(` - ${inf.name} (@${inf.username}) | ${inf.followers} followers | pic: ${inf.profilePicUrl? 'YES':'—'} | ER: ${inf.engagementRate??'?'}`)
console.log('\n=== influencerResearch.recommendations (has real IG pic urls) ===')
for (const inf of (d.influencerResearch?.recommendations||[])) console.log(` - ${inf.name} (@${inf.handle}) | ${inf.followers} | verified:${inf.isVerified} | pic:${inf.profilePicUrl?.slice(0,60)}`)
console.log('\n=== deliverables source field ===')
console.log('d.deliverables:', JSON.stringify(d.deliverables))
console.log('d.deliverablesSummary:', JSON.stringify(d.deliverablesSummary))
// do the "6"/"18"/"3" quantities have a source?
const src = JSON.stringify({del:d.deliverables, sum:d.deliverablesSummary})
console.log('"6 Reel" quantities sourced?', /6.*reel|reel.*6|18|טיקטוק|tiktok/i.test(src))
console.log('\n=== which images did influencer slides actually use? ===')
const slides = d._agentSlides||[]
for (let i=12;i<=15 && i<slides.length;i++){ const s=slides[i]; console.log(` slide${i+1} [${s.slideType}] "${s.title}" img: ...${(s.content?.imageUrl||'').slice(-40)}`)}
