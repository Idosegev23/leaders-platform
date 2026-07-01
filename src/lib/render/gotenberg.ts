import { PDFDocument } from 'pdf-lib'

const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://localhost:3001'
const SLIDE_W = 1920
const SLIDE_H = 1080

/** Screenshot one full-slide HTML document to a PNG via Gotenberg's Chromium.
 *  Screenshot (not print) preserves gradients/blur/glass — matching the
 *  previous puppeteer screenshot approach. */
export async function htmlToPng(
  html: string,
  opts: { width?: number; height?: number; waitDelay?: string } = {},
): Promise<Buffer> {
  const form = new FormData()
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html')
  form.append('width', String(opts.width ?? SLIDE_W))
  form.append('height', String(opts.height ?? SLIDE_H))
  form.append('format', 'png')
  // Give web fonts + images time to settle (mirrors the old 1200ms font wait).
  form.append('waitDelay', opts.waitDelay ?? '1.2s')

  const res = await fetch(`${GOTENBERG_URL}/forms/chromium/screenshot/html`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gotenberg screenshot failed (${res.status}): ${detail.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Assemble per-slide PNGs into a single 16:9 PDF (one page per PNG). */
export async function pngsToPdf(
  pngs: Buffer[],
  meta: { title?: string; brandName?: string } = {},
): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (const png of pngs) {
    const img = await pdf.embedPng(png)
    const page = pdf.addPage([SLIDE_W, SLIDE_H])
    page.drawImage(img, { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H })
  }
  pdf.setTitle(meta.title || 'Presentation')
  pdf.setAuthor(meta.brandName || 'Leaders')
  pdf.setCreator('Leaders — Gotenberg render')
  pdf.setCreationDate(new Date())
  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

/** Full path: array of slide HTML docs → PDF buffer. */
export async function htmlSlidesToPdf(
  slides: string[],
  meta: { title?: string; brandName?: string } = {},
): Promise<Buffer> {
  if (slides.length === 0) throw new Error('htmlSlidesToPdf: no slides provided')
  const pngs: Buffer[] = []
  for (const slide of slides) {
    pngs.push(await htmlToPng(slide))
  }
  return pngsToPdf(pngs, meta)
}
