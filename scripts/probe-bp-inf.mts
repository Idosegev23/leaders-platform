import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('=== normalized influencer names (post-normalizer) ===')
for (const e of (d.enhancedInfluencers||[])) console.log(`  ${e.username}: name="${e.name}" pic=${(e.profilePicUrl||'').includes('supabase')?'SUPABASE':'raw/other'}`)
console.log('\n=== blueprint influencer + metrics/results slide titles (source of agent titles) ===')
for (const s of (d._deckBlueprint?.slidePlan||[])) if (/influenc|metric|result|competit/i.test(s.slideType)) console.log(`  [${s.slideType}] "${s.title}" — shows: ${(s.whatItShows||'').slice(0,70)}`)
