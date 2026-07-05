import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const html: string[] = d._htmlPresentation?.htmlSlides || []
const slides: any[] = d._agentSlides || d._htmlPresentation?.slides || []
console.log('=== agent slide[4] content (insight) ===')
console.log(JSON.stringify(slides[4]?.content || slides[4], null, 1)?.slice(0, 500))
console.log('\n=== htmlSlide[4] length:', html[4]?.length)
console.log('=== htmlSlide[4] body (strip head) ===')
const body = (html[4]||'').replace(/[\s\S]*?<body[^>]*>/i,'').slice(0, 1400)
console.log(body)
console.log('\n=== HEAD/style of slide[4] ===')
const head = (html[4]||'').match(/<style>([\s\S]*?)<\/style>/)?.[1] || '(no style)'
console.log(head.slice(0, 900))
