import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
for (const key of ['influencerResearch','_influencerStrategy','enhancedInfluencers']) {
  const v = d[key]; const arr = Array.isArray(v) ? v : v?.recommendations
  console.log(`${key}: ${Array.isArray(v)?'array':typeof v} | recs=${Array.isArray(arr)?arr.length:'-'}`)
  if (Array.isArray(arr) && arr[0]) console.log(`   sample: name="${arr[0].name}" user="${arr[0].username||arr[0].handle}" pic=${(arr[0].profilePicUrl||'').slice(0,45)||'(empty)'}`)
}
