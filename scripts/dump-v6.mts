import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const out: string[] = []
;(d._agentSlides||[]).forEach((s:any,i:number)=>{ const c=s.content||{}; out.push(`──── SLIDE ${i+1} [${s.slideType}] "${s.title}" ────`); const img=c.imageUrl||''; out.push(`img: ${img.includes('/scenes/')?'AI-SCENE '+img.split('/').pop():img.includes('cdninstagram')||img.includes('&oe=')?'RAW-IG-URL':img.includes('/influencers/')?'REHOSTED-PHOTO':img?'OTHER:'+img.slice(-40):'(none)'}`); if(c.subtitle)out.push(`subtitle: ${c.subtitle}`); if(c.bodyText)out.push(`body: ${c.bodyText}`); if(c.keyNumber)out.push(`keyNumber: ${c.keyNumber} ${c.keyNumberLabel||''}`); if(c.bulletPoints)out.push(`bullets: ${JSON.stringify(c.bulletPoints)}`); if(c.cards)out.push(`cards: ${JSON.stringify(c.cards)}`); out.push('') })
fs.writeFileSync('.pptx-verify/v6-content.txt', out.join('\n'))
console.log('wrote v6-content.txt,', (d._agentSlides||[]).length, 'slides')
