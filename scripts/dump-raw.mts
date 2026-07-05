import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const html: string[] = (data!.data as any)._htmlPresentation?.htmlSlides || []
fs.writeFileSync('.pptx-verify/slide05-raw.html', html[4])
console.log('slide 5 length:', html[4].length)
console.log('--- suspicious CSS features present? ---')
for (const feat of ['content-visibility','contain:','will-change','mix-blend','backdrop-filter','position:fixed','@media','@supports','clip-path','mask','filter:','isolation','@keyframes','animation','translate','scale(','perspective']) {
  const n = (html[4].match(new RegExp(feat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'))||[]).length
  if (n) console.log(`  ${feat}: ${n}`)
}
