import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const { renderAgentSlide, pickPersona } = await import('@/lib/gemini/slide-personas')
const sharp = (await import('sharp')).default
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const DOC='52fb07e3-3d63-4e2a-b923-8ee352d6b1dc'
const { data } = await sb.from('documents').select('data').eq('id',DOC).single()
const d = data!.data as any
const persona = pickPersona('סולתם')
const slides = d._agentSlides || []
const html: string[] = d._htmlPresentation.htmlSlides

// ── 1. tighter crop for Danielle (upper-center face) → re-host ──
const dURL='https://fhgggqnaplshwbrzgima.supabase.co/storage/v1/object/public/assets/influencers/clean/danielamit.png'
try {
  const buf = Buffer.from(await (await fetch(dURL)).arrayBuffer())
  const meta = await sharp(buf).metadata(); const W=meta.width||2048, H=meta.height||2048
  const side=Math.round(W*0.60), left=Math.round((W-side)/2), top=Math.round(H*0.04)
  const cropped = await sharp(buf).extract({left,top,width:side,height:Math.min(side,H-top)}).resize(1000,1000,{fit:'cover'}).png().toBuffer()
  await sb.storage.from('assets').upload('influencers/clean/danielamit-tight.png',cropped,{contentType:'image/png',upsert:true})
  var dTight = sb.storage.from('assets').getPublicUrl('influencers/clean/danielamit-tight.png').data.publicUrl
  console.log('  danielle tight crop ok')
} catch(e){ var dTight=''; console.log('  danielle crop failed', (e as Error).message) }

// ── 2. Hebrew name map ──
const heb: Record<string,string> = { 'Danielle Amit':'דניאל עמית','Efrat Lichtenstadt':'אפרת ליכטנשטט','Kobi Edri':'קובי אדרי','Gil Harel':'גיל הראל' }
const hebrewize = (s:string) => { let x=s||''; for (const [en,he] of Object.entries(heb)) x=x.split(en).join(he); return x }
// update enhancedInfluencers names
for (const inf of (d.enhancedInfluencers||[])) inf.name = hebrewize(inf.name||'')

// ── 3. reconcile deliverables cards ──
const delIdx = slides.findIndex((s:any)=>s.slideType==='deliverables')
if (delIdx>=0){
  slides[delIdx].content.cards = [
    {title:'6 Reel', body:'ריל מלא מכל אחד מ-5 היוצרים + ריל בונוס מהמשפיענית המובילה (דניאל עמית). זכויות שימוש מלאות לקידום ממומן.'},
    {title:'18 Story', body:'3–4 סטוריז לכל יוצר (18 בסך הכל) — הצגת תהליך, חוויית הניקוי ולינק המרה (קופון/אתר).'},
    {title:'3 TikTok', body:'סרטוני בישול קצביים לקהל הצעיר — עז תלם, גיל הראל וקובי אדרי.'},
  ]
}

// ── 4. re-render affected slides (influencers + deliverables) ──
const sample = html.find((h,i)=>slides[i]?.slideType!=='influencers') || html[0]
const inject = ((sample.match(/<img[^>]*alt="Leaders"[^>]*\/>/g)||[]).concat(sample.match(/<img[^>]*alt="סולתם"[^>]*\/>/g)||[])).join('')
const infs = (d.enhancedInfluencers||[]) as any[]
let n=0
for (let i=0;i<slides.length;i++){
  const s=slides[i]; if (!['influencers','deliverables'].includes(s.slideType)) continue
  if (s.slideType==='influencers'){
    s.title = hebrewize(s.title||''); if (s.content){ s.content.title=hebrewize(s.content.title||s.title); if(s.content.bodyText)s.content.bodyText=hebrewize(s.content.bodyText) }
    if (dTight && (s.title.includes('דניאל')||/danielamit/i.test(s.content?.imageUrl||''))) s.content.imageUrl=dTight
  }
  const args={...s.content, slideType:s.slideType, title:s.title}
  let h=renderAgentSlide(args,{persona,slideIndex:i,brandName:'סולתם'})
  if (inject && !h.includes('new_logo')&&!h.includes('alt="Leaders"')) h=h.replace('</div></body>',`${inject}</div></body>`)
  html[i]=h; n++
}
await sb.from('documents').update({data:d,updated_at:new Date().toISOString()}).eq('id',DOC)
console.log('re-rendered',n,'slides (influencers+deliverables), names→Hebrew, deliverables reconciled, saved')
