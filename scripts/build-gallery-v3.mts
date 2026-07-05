import fs from 'node:fs'; import path from 'node:path'
const dir = path.join(process.cwd(), '.pptx-verify', 'soltam-v3')
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()
const cards = files.map((f, i) => {
  const b64 = fs.readFileSync(path.join(dir, f)).toString('base64')
  const label = f.replace(/\.jpg$/, '')
  return `<figure><figcaption>${String(i+1).padStart(2,'0')} · ${label.replace(/^s\d+-/, '')}</figcaption><img src="data:image/jpeg;base64,${b64}"/></figure>`
}).join('\n')
const html = `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>סולתם v3 — 22 שקפים (מוצרים אמיתיים)</title>
<style>
body{margin:0;background:#1a1a1a;font-family:system-ui,-apple-system,'Assistant',sans-serif;color:#eee;}
header{position:sticky;top:0;background:#111;padding:14px 24px;font-size:15px;border-bottom:1px solid #333;z-index:5;}
header b{color:#fff;} header span{color:#888;}
main{max-width:1300px;margin:0 auto;padding:24px;display:flex;flex-direction:column;gap:28px;}
figure{margin:0;background:#000;border-radius:10px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.5);}
figcaption{padding:8px 16px;font-size:13px;color:#9aa;letter-spacing:1px;text-transform:uppercase;background:#0d0d0d;}
img{display:block;width:100%;height:auto;}
</style></head><body>
<header><b>סולתם · הסיר שלי, המתכון שלך</b> &nbsp;<span>22 שקפים · מוצרי סולתם אמיתיים + לוגו · לחיצה על תמונה = מסך מלא</span></header>
<main>${cards}</main>
<script>document.querySelectorAll('img').forEach(function(im){im.style.cursor='zoom-in';im.onclick=function(){if(im.requestFullscreen)im.requestFullscreen();}});</script>
</body></html>`
const out = path.join(dir, '_gallery.html')
fs.writeFileSync(out, html)
console.log(out)
