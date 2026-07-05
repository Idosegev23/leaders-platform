import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await sb.from('documents').select('data, updated_at').eq('id', '52fb07e3-3d63-4e2a-b923-8ee352d6b1dc').single()
const d = data!.data as any
console.log('doc updated_at:', data!.updated_at)
console.log('now (approx via file mtime):', fs.statSync(envPath).mtimeMs && new Date(Math.max(...[Date.parse(data!.updated_at)])).toISOString())
const hp = d._htmlPresentation
console.log('htmlSlides:', hp?.htmlSlides?.length, '| pipeline:', hp?.metadata?.pipeline, '| createdAt:', hp?.metadata?.createdAt)
console.log('slideTypes:', (hp?.slideTypes||[]).join(', '))
console.log('_slideCritique:', JSON.stringify(d._slideCritique?.flaggedCount), '/', d._slideCritique?.slideCount, '| checkedAt:', d._slideCritique?.checkedAt)
console.log('_agentResult.durationMs:', d._agentResult?.durationMs, '| slideCount:', d._agentResult?.slideCount)
