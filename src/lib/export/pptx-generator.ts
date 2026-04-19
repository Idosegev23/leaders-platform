/**
 * Image-based PPTX Generator
 * Renders HTML slides to PNG screenshots, places each as a full-slide image.
 * Result: pixel-perfect copy of the HTML presentation as a .pptx file.
 */

import PptxGenJS from 'pptxgenjs'
import { renderSlidesToImages } from '@/lib/playwright/pdf'

const CANVAS = { w: 13.33, h: 7.5 }

export async function generatePptx(
  _data: Record<string, unknown>,
  htmlSlides: string[]
): Promise<Buffer> {
  console.log(`[PPTX] Starting image-based generation: ${htmlSlides.length} slides`)

  // Render all HTML slides to PNG
  const slideImages = await renderSlidesToImages(htmlSlides)
  console.log(`[PPTX] Rendered ${slideImages.length} slide images`)

  // Build PPTX with image slides
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'Custom_16x9', width: CANVAS.w, height: CANVAS.h })
  pptx.layout = 'Custom_16x9'

  for (let i = 0; i < slideImages.length; i++) {
    const slide = pptx.addSlide()
    slide.background = { data: `image/png;base64,${slideImages[i]}` }
  }

  console.log(`[PPTX] Built ${slideImages.length} image slides`)

  const output = await pptx.write({ outputType: 'nodebuffer' })
  return output as Buffer
}
