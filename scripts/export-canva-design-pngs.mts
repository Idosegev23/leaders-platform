/**
 * QA helper: export a Canva design to PNGs via the platform's own Canva token,
 * so we can visually verify what Canva made of our native-PPTX import.
 * Usage: npx tsx scripts/export-canva-design-pngs.mts <designId> [outDir]
 */
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}

const designId = process.argv[2]
if (!designId) throw new Error('usage: npx tsx scripts/export-canva-design-pngs.mts <designId> [outDir]')
const outDir = process.argv[3] || path.join(process.cwd(), '.pptx-verify', `canva-${designId}`)
fs.mkdirSync(outDir, { recursive: true })

const { getValidAccessToken } = await import('../src/lib/canva/oauth')
const token = await getValidAccessToken()
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

const createRes = await fetch('https://api.canva.com/rest/v1/exports', {
  method: 'POST', headers: H,
  body: JSON.stringify({ design_id: designId, format: { type: 'png', width: 960, height: 540 } }),
})
const createText = await createRes.text()
if (!createRes.ok) throw new Error(`export create ${createRes.status}: ${createText.slice(0, 400)}`)
const jobId = JSON.parse(createText).job?.id
console.log(`export job ${jobId} — polling…`)

let urls: string[] = []
for (let i = 0; i < 60; i++) {
  const res = await fetch(`https://api.canva.com/rest/v1/exports/${jobId}`, { headers: H })
  const data = await res.json()
  const status = data.job?.status
  if (status === 'success') { urls = data.job.urls || []; break }
  if (status === 'failed') throw new Error(`export failed: ${JSON.stringify(data.job?.error)}`)
  await new Promise((r) => setTimeout(r, 2000))
}
if (!urls.length) throw new Error('export timed out / no urls')

console.log(`${urls.length} pages exported, downloading…`)
for (let i = 0; i < urls.length; i++) {
  const res = await fetch(urls[i])
  const buf = Buffer.from(await res.arrayBuffer())
  const file = path.join(outDir, `page-${String(i + 1).padStart(2, '0')}.png`)
  fs.writeFileSync(file, buf)
}
console.log(`saved to ${outDir}`)
