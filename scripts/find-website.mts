import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('top-level url-ish fields:', Object.keys(d).filter(k=>/site|web|url|domain/i.test(k)).map(k=>`${k}=${d[k]}`))
console.log('brandResearch.website:', d._brandResearch?.website || d._brandResearch?.websiteDomain || '—')
const brief = (typeof d.brandBrief==='string'?d.brandBrief:'')
const m = brief.match(/"website"\s*:\s*"([^"]+)"/); console.log('website in brandBrief JSON:', m?.[1]||'—')
console.log('subIndustry:', (brief.match(/"subIndustry"\s*:\s*"([^"]+)"/)||[])[1]||'—')
