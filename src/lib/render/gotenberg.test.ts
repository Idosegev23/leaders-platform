import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { pngsToPdf } from './gotenberg'

async function tinyPng(): Promise<Buffer> {
  // 1x1 transparent PNG embedded into a doc just to get valid PNG bytes
  const doc = await PDFDocument.create()
  // Build a minimal valid PNG via a known base64 1x1 transparent pixel
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  return Buffer.from(b64, 'base64')
}

describe('pngsToPdf', () => {
  it('produces a PDF with one 1920x1080 page per PNG', async () => {
    const png = await tinyPng()
    const pdfBuf = await pngsToPdf([png, png, png], { title: 'T', brandName: 'B' })
    const pdf = await PDFDocument.load(pdfBuf)
    expect(pdf.getPageCount()).toBe(3)
    const { width, height } = pdf.getPage(0).getSize()
    expect(Math.round(width)).toBe(1920)
    expect(Math.round(height)).toBe(1080)
    expect(pdf.getTitle()).toBe('T')
  })
})
