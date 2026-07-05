import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { renderAgentSlide, pickPersona } = await import('@/lib/gemini/slide-personas')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const persona = pickPersona('סולתם')
const slides = d._agentSlides || []
const html: string[] = d._htmlPresentation.htmlSlides
// cleaned photo per username + name
const infs = (d.enhancedInfluencers||[]) as any[]
// extract the two logo <img> tags from a non-influencer slide to re-inject identically
const sample = html.find((h,i)=>slides[i]?.slideType!=='influencers') || html[0]
const logoTags = (sample.match(/<img[^>]*(new_logo|alt="Leaders")[^>]*\/>/g)||[]).concat(sample.match(/<img[^>]*alt="סולתם"[^>]*\/>/g)||[])
const inject = logoTags.join('')
let patched = 0
for (let i=0;i<slides.length;i++){
  const s = slides[i]
  if (s.slideType!=='influencers' || !s.content?.keyNumber) continue
  // match cleaned photo by name appearing in title
  const title = (s.title||'')
  let photo = s.content.imageUrl
  for (const inf of infs){ const nm=(inf.name||'').replace(/[()@]/g,'').trim(); const un=inf.username||''; if(nm && title.includes(nm.split(' ')[0])){ photo = inf.profilePicUrl || photo; break } if(un && title.toLowerCase().includes(un.toLowerCase())){ photo = inf.profilePicUrl || photo; break } }
  const args = { ...s.content, slideType: s.slideType, title: s.title, imageUrl: photo }
  let h = renderAgentSlide(args, { persona, slideIndex: i, brandName: 'סולתם' })
  // re-inject logos before </div></body>
  if (inject && !h.includes('new_logo')) h = h.replace('</div></body>', `${inject}</div></body>`)
  html[i] = h
  // also update the stored content imageUrl
  s.content.imageUrl = photo
  patched++
  console.log(`  patched slide ${i+1}: ${title.slice(0,30)} -> ...${(photo||'').slice(-30)}`)
}
await sb.from('documents').update({ data: d, updated_at: new Date().toISOString() }).eq('id','52fb07e3-3d63-4e2a-b923-8ee352d6b1dc')
console.log('patched', patched, 'influencer slides + saved')
