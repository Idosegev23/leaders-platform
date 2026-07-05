import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { acquireBrandAssets, extractBrandWebsite, extractProductContext } = await import('@/lib/brand/acquire')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('website extracted:', extractBrandWebsite(d))
console.log('productContext:', extractProductContext(d))
const t0 = Date.now()
const res = await acquireBrandAssets({ brandName:'סולתם', website: extractBrandWebsite(d), productContext: extractProductContext(d) })
console.log(`\n--- acquired in ${((Date.now()-t0)/1000).toFixed(0)}s ---`)
console.log('scraped logoUrl:', res.scraped?.logoUrl)
console.log('scraped images:', res.scraped?.images?.length, '| hero:', res.scraped?.heroImages?.length)
console.log('LOGO:', res.brandAssets.logo?.status, res.brandAssets.logo?.source, res.brandAssets.logo?.url?.slice(0,80))
console.log('PRODUCTS:', res.brandAssets.productImages?.length || 0)
for (const p of (res.brandAssets.productImages||[])) console.log(`  [${p.status}] ${p.url.slice(0,90)}`)
