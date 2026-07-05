import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { rehostImage } = await import('@/lib/brand/rehost-image')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const LOGO = 'https://soltam.co.il/wp-content/uploads/2025/10/logo-1.png'
const PRODUCTS = [
  'https://soltam.co.il/wp-content/uploads/2021/10/30007LI.jpeg',     // Soltam-branded baking/utensil set
  'https://soltam.co.il/wp-content/uploads/2022/06/IMG_0050.jpg',     // Soltam grater in lifestyle scene
  'https://soltam.co.il/wp-content/uploads/2022/06/IMG_1764.jpg',
  'https://soltam.co.il/wp-content/uploads/2022/06/IMG_1883.jpg',
  'https://soltam.co.il/wp-content/uploads/2023/07/11222071.jpeg',
  'https://soltam.co.il/wp-content/uploads/2022/06/IMG_0026.jpg',     // Soltam enamel plate lifestyle
]
const logo = await rehostImage(LOGO, 'brand/soltam2', 'logo', sb as any)
const products: {url:string}[] = []
for (let i=0;i<PRODUCTS.length;i++){ const st = await rehostImage(PRODUCTS[i], 'brand/soltam2', `product-${i}`, sb as any); if (st) products.push({ url: st }) }
console.log('rehosted logo=', !!logo, 'products=', products.length)
if (products.length < 3) process.exit(1)
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
d._brandAssets = { updatedAt: new Date().toISOString(), logo: { url: logo, status:'verified', source:'manual' }, productImages: products.map(p=>({url:p.url,status:'verified',reasoning:'real Soltam product (curated)'})) }
delete d._generatedImages; delete d._htmlPresentation; delete d._agentSlides; delete d._slideCritique; delete d._agentResult
await sb.from('documents').update({ data: d, updated_at: new Date().toISOString() }).eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc')
console.log('✅ reseeded with', products.length, 'curated Soltam products + logo')
