import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
// any key that could hold REAL follower counts?
const keys = Object.keys(d).filter(k=>/influenc|follow|creator|talent|social/i.test(k))
console.log('influencer-related keys:', keys)
for (const k of keys) console.log(`  ${k}:`, JSON.stringify(d[k]).slice(0,400))
// does 524 / 353 appear anywhere in source (brief/research/wizard)?
const hay = JSON.stringify({brief:d._briefText, brandBrief:d.brandBrief, research:d._brandResearch, wizardInfluencers:d.influencers, selected:d.selectedInfluencers})
console.log('\n"524" in source data:', hay.includes('524'))
console.log('"353" in source data:', hay.includes('353'))
console.log('"524" or "353" appear ONLY in generated slides =>', !hay.includes('524') && !hay.includes('353') ? 'FABRICATED BY MODEL' : 'possibly sourced')
