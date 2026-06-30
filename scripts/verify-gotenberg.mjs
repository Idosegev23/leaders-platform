// Run: node scripts/verify-gotenberg.mjs
const URL = process.env.GOTENBERG_URL || 'http://localhost:3001'
const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>html,body{margin:0}.slide{width:1920px;height:1080px;display:flex;align-items:center;
justify-content:center;background:linear-gradient(135deg,#1a1a2e,#E94560);color:#fff;
font:700 120px Heebo,sans-serif}</style></head>
<body><div class="slide">שלום עולם</div></body></html>`

const form = new FormData()
form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
form.append('width', '1920')
form.append('height', '1080')
form.append('format', 'png')
form.append('waitDelay', '1s')

const res = await fetch(`${URL}/forms/chromium/screenshot/html`, { method: 'POST', body: form })
if (!res.ok) { console.error('FAIL', res.status, await res.text()); process.exit(1) }
const buf = Buffer.from(await res.arrayBuffer())
if (buf.length < 5000 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
  console.error('FAIL: not a PNG or too small', buf.length); process.exit(1)
}
console.log('OK: Gotenberg screenshot PNG', buf.length, 'bytes')
