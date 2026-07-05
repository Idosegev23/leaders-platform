import fs from 'node:fs'; import path from 'node:path'
const sharp = (await import('sharp')).default
const dir = '.pptx-verify/soltam-v7'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).sort()
const W = 4, tw = 460, th = 260
const rows = Math.ceil(files.length / W)
const tiles = await Promise.all(files.map(f => sharp(path.join(dir, f)).resize(tw - 8, th - 30, { fit: 'contain', background: '#1a1a1a' }).extend({ top: 4, bottom: 22, left: 4, right: 4, background: '#1a1a1a' }).toBuffer()))
await sharp({ create: { width: tw * W, height: th * rows, channels: 3, background: '#1a1a1a' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % W) * tw, top: Math.floor(i / W) * th })))
  .jpeg({ quality: 82 }).toFile('.pptx-verify/v7-contact.jpg')
console.log('contact sheet built:', files.length, 'tiles', tw*W, 'x', th*rows)
