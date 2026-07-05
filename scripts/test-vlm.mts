import fs from 'node:fs'; import path from 'node:path'
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1') }
const { vlmBinaryCheck } = await import('@/lib/brand/vlm-verify')
try {
  const r = await vlmBinaryCheck({ imageUrl: 'https://soltam.co.il/wp-content/uploads/2026/06/DGT_153358_BOX_600-%C3%97-6004.jpg', question: 'Does this image clearly show a physical cookware product (pot/pan)?' })
  console.log('VLM verdict:', JSON.stringify(r))
} catch(e){ console.log('VLM threw:', (e as Error).message.slice(0,120)) }
