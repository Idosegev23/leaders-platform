import { getBrowser } from '@/lib/playwright/pdf'
const sharp = (await import('sharp')).default
const browser = await getBrowser()
async function test(name: string, html: string) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await new Promise(r => setTimeout(r, 500))
  const buf = await page.screenshot({ type:'png', clip:{x:0,y:0,width:1920,height:1080} }) as Buffer
  await page.close()
  const st = await sharp(buf).stats()
  const [r,g,b] = st.channels.slice(0,3).map(c=>Math.round(c.mean))
  const stdev = st.channels.slice(0,3).reduce((a,c)=>a+c.stdev,0)/3
  console.log(`${name}\tRGB(${r},${g},${b}) stdev=${stdev.toFixed(1)} ${stdev<2 && r>250 && g>250 && b>250 ? '⚠️ WHITE/BLANK':'✅ painted'}`)
}
await test('red-box   ', '<div style="background:#cc0000;width:1920px;height:1080px;"><h1 style="color:white;font-size:120px;padding:80px;">HELLO</h1></div>')
await test('cream+text', `<style>.slide{width:1920px;height:1080px;background:#f1eee9;position:relative;}</style><div class="slide"><h1 style="color:#26231F;font-size:100px;padding:80px;">שלום עולם</h1></div>`)
await test('cream+link', `<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;900&display=swap" rel="stylesheet"><style>.slide{width:1920px;height:1080px;background:#f1eee9;position:relative;font-family:Assistant,sans-serif;}</style><div class="slide"><h1 style="color:#26231F;font-size:100px;padding:80px;">שלום עם פונט</h1></div>`)
await browser.close()
