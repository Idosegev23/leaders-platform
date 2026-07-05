import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('_scraped.logoUrl:', d._scraped?.logoUrl || '—')
console.log('_scraped.heroImages:', (d._scraped?.heroImages||[]).length, 'images')
console.log('_brandAssets.logo:', d._brandAssets?.logo?.url || '—')
console.log('_brandAssets.productImages:', (d._brandAssets?.productImages||d._brandAssets?.products||[]).length||0)
console.log('brandLogoFile:', d.brandLogoFile || '—')
console.log('all _brandAssets keys:', d._brandAssets? Object.keys(d._brandAssets):'(none)')
