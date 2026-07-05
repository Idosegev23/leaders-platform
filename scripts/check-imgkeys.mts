import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('_generatedImages keys:', d._generatedImages ? Object.keys(d._generatedImages) : '(none)')
console.log('_scraped:', d._scraped ? Object.keys(d._scraped) : '(none)')
console.log('_pipelineStatus:', JSON.stringify(d._pipelineStatus))
console.log('_visualAssetsMeta / status keys present:', Object.keys(d).filter(k=>/visual|scrape|asset|scene|logo/i.test(k)))
console.log('has _brandAssets:', !!d._brandAssets)
// count agent_ vs brand_ images across slides
const slides = d._agentSlides||[]
let agent=0, brand=0, other=0
for (const s of slides){ const u=s.content?.imageUrl||''; if(/agent_/.test(u))agent++; else if(/brand_/.test(u))brand++; else if(u)other++; }
console.log(`slide images: agent_=${agent} brand_=${brand} other=${other}`)
