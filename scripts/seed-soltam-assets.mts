import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { fetchScrape } = await import('@/lib/apify/fetch-scraper')
const { rehostImage } = await import('@/lib/brand/rehost-image')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
// 1) scrape soltam locally (works from residential IP)
const s = await fetchScrape('https://soltam.co.il')
console.log('scraped locally: logo=', !!s.logoUrl, 'product=', s.productImages.length, 'hero=', s.heroImages.length, 'lifestyle=', s.lifestyleImages.length)
const productUrls = Array.from(new Set([...s.productImages, ...s.heroImages, ...s.lifestyleImages]))
  .filter(u => /\.(jpg|jpeg|png|webp)/i.test(u) && !/logo|icon|favicon|placeholder|sprite/i.test(u))
  .slice(0, 6)
console.log('candidate product urls:', productUrls.length)
// 2) rehost logo + products to Supabase (from local, which can fetch soltam)
const logoStable = s.logoUrl ? await rehostImage(s.logoUrl, 'brand/soltam', 'logo', sb as any) : null
const products: {url:string;status:string}[] = []
for (let i=0;i<productUrls.length;i++){ const st = await rehostImage(productUrls[i], 'brand/soltam', `product-${i}`, sb as any); if (st) products.push({ url: st, status: 'verified' }) }
console.log('rehosted: logo=', !!logoStable, 'products=', products.length)
products.forEach(p=>console.log('   ', p.url.slice(-60)))
if (products.length < 2) { console.error('!! too few products rehosted — soltam may block this machine too'); process.exit(1) }
// 3) write _brandAssets + clear stale generated imagery so the agent regenerates on real products
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
d._brandAssets = { updatedAt: new Date().toISOString(), ...(logoStable?{logo:{url:logoStable,status:'verified',source:'manual'}}:{}) , productImages: products.map(p=>({url:p.url,status:'verified',reasoning:'seeded real Soltam product'})) }
delete d._generatedImages   // force fresh reference-conditioned imagery
delete d._htmlPresentation; delete d._agentSlides; delete d._slideCritique; delete d._agentResult
await sb.from('documents').update({ data: d, updated_at: new Date().toISOString() }).eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc')
console.log('✅ seeded _brandAssets with', products.length, 'real Soltam products + logo=', !!logoStable, '| cleared stale imagery')
