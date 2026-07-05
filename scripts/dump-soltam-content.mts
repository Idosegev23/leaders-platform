import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
const out: string[] = []
const P = (s: string) => out.push(s)

P('################ WIZARD INPUT (what the user actually asked for) ################')
const wz: Record<string,any> = {}
for (const [k,v] of Object.entries(d)) { if (!k.startsWith('_') && typeof v !== 'object') wz[k]=v }
P(JSON.stringify(wz, null, 1))
P('\nbrandBrief/_briefText (first 1500):')
P(((d._briefText||d.brandBrief||'')+'').slice(0,1500))

P('\n\n################ BRAND RESEARCH (the "facts" the deck stands on) ################')
P(JSON.stringify(d._brandResearch, null, 1)?.slice(0, 3000) || '(none)')

P('\n\n################ DECK BLUEPRINT — הפיצוח (the strategic brain) ################')
const bp = d._deckBlueprint
if (bp) {
  P('theCrack: ' + bp.theCrack)
  P('keyInsight: ' + bp.keyInsight)
  P('strategy.headline: ' + bp.strategy?.headline)
  P('strategy.pillars: ' + JSON.stringify(bp.strategy?.pillars, null, 1))
  P('audienceFocus: ' + bp.audienceFocus)
  P('slidePlan (' + (bp.slidePlan?.length||0) + '):')
  bp.slidePlan?.forEach((s:any,i:number)=>P(`  [${i+1}] ${s.slideType||s.type||''} | ${s.title||''} — shows: ${s.whatItShows||s.focus||''}`))
} else P('(no blueprint)')

P('\n\n################ AGENT SLIDES — actual generated copy per slide ################')
const slides = d._agentSlides || []
slides.forEach((s:any,i:number)=>{
  P(`\n───── SLIDE ${i+1}: [${s.slideType}] "${s.title}" ─────`)
  const c = s.content
  if (typeof c === 'string') P(c.slice(0,1200))
  else P(JSON.stringify(c, null, 1).slice(0, 1600))
})

P('\n\n################ INFLUENCERS + KPIs (from agent result) ################')
P('influencers: ' + JSON.stringify(d._agentResult?.influencers, null, 1))
P('kpis: ' + JSON.stringify(d._agentResult?.kpis, null, 1))

P('\n\n################ WIZARD COVERAGE (what got dropped) ################')
P('report: ' + (d._wizardCoverage?.report||'(none)'))
P('missing: ' + JSON.stringify(d._wizardCoverage?.missing, null, 1))

fs.writeFileSync('.pptx-verify/soltam-content.txt', out.join('\n'))
console.log('wrote .pptx-verify/soltam-content.txt —', out.join('\n').length, 'chars')
console.log('slides:', slides.length, '| blueprint slides:', bp?.slidePlan?.length)
