import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

export interface PdfOptions {
  format?: 'A4' | '16:9'
  landscape?: boolean
  title?: string
  brandName?: string
}

/**
 * Get browser instance for Vercel serverless
 */
async function getBrowser() {
  // Check if running on Vercel/AWS Lambda
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL

  if (isServerless) {
    // Use @sparticuz/chromium for serverless environments
    const executablePath = await chromium.executablePath()
    
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      headless: true,
    })
  } else {
    // Local development - try to use local Chrome
    const executablePath = process.platform === 'darwin' 
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome'

    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })
  }
}

/**
 * Generate PDF from HTML content
 */
export async function generatePdf(
  html: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' })

    // Wait for fonts to load - extra time for serverless environments
    await page.evaluate(() => document.fonts?.ready)
    await new Promise(resolve => setTimeout(resolve, 1000)) // Extra 1s for font rendering

    // Generate PDF
    const pdfOptions = options.format === '16:9' 
      ? {
          width: '1920px',
          height: '1080px',
          printBackground: true,
          preferCSSPageSize: true,
        }
      : {
          format: 'A4' as const,
          printBackground: true,
          preferCSSPageSize: true,
        }

    const pdfBuffer = await page.pdf(pdfOptions)
    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * Generate multi-page PDF from array of HTML pages.
 * Uses a SINGLE browser instance for all pages (much faster).
 */
export async function generateMultiPagePdf(
  htmlPages: string[],
  options: PdfOptions = {}
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  const browser = await getBrowser()

  try {
    const mergedPdf = await PDFDocument.create()
    const pdfOpts = options.format === '16:9'
      ? { width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true }
      : { format: 'A4' as const, printBackground: true, preferCSSPageSize: true }

    console.log(`[PDF] Rendering ${htmlPages.length} slides with single browser instance`)

    for (let i = 0; i < htmlPages.length; i++) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })
      await page.setContent(htmlPages[i], { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts?.ready)
      // First page: 1200ms for initial font load; rest: 400ms (fonts already cached)
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 1200 : 400))

      const pageBuffer = await page.pdf(pdfOpts)
      await page.close()

      const pagePdf = await PDFDocument.load(pageBuffer)
      const copiedPages = await mergedPdf.copyPages(pagePdf, pagePdf.getPageIndices())
      copiedPages.forEach(p => mergedPdf.addPage(p))
    }

    // Add rich metadata for better editability in external tools
    mergedPdf.setTitle(options.title || 'Presentation')
    mergedPdf.setAuthor(options.brandName || 'Leaders')
    mergedPdf.setSubject('Proposal Presentation')
    mergedPdf.setKeywords(['proposal', 'presentation', options.brandName].filter(Boolean) as string[])
    mergedPdf.setCreator('Leaders pptmaker')
    mergedPdf.setProducer('Leaders pptmaker - Puppeteer/pdf-lib')
    mergedPdf.setCreationDate(new Date())
    mergedPdf.setModificationDate(new Date())

    const mergedBuffer = await mergedPdf.save()
    console.log(`[PDF] All ${htmlPages.length} slides rendered successfully`)
    return Buffer.from(mergedBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * Generate screenshot from HTML (for preview)
 */
export async function generateScreenshot(
  html: string,
  options: { width?: number; height?: number } = {}
): Promise<Buffer> {
  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    await page.setViewport({
      width: options.width || 1200,
      height: options.height || 800,
    })

    await page.setContent(html, { waitUntil: 'networkidle0' })
    await page.evaluate(() => document.fonts?.ready)

    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png',
    })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}

/**
 * Render multiple HTML slides to PNG images (single browser instance).
 * Returns array of base64-encoded PNG strings for embedding in PPTX.
 */
export async function renderSlidesToImages(
  htmlSlides: string[]
): Promise<string[]> {
  const browser = await getBrowser()
  const images: string[] = []

  try {
    console.log(`[Screenshots] Rendering ${htmlSlides.length} slides to PNG`)

    for (let i = 0; i < htmlSlides.length; i++) {
      const page = await browser.newPage()
      await page.setViewport({ width: 1920, height: 1080 })
      await page.setContent(htmlSlides[i], { waitUntil: 'networkidle0' })
      await page.evaluate(() => document.fonts?.ready)
      await new Promise(resolve => setTimeout(resolve, i === 0 ? 800 : 300))

      const screenshot = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      })
      await page.close()

      const base64 = Buffer.from(screenshot).toString('base64')
      images.push(base64)
    }

    console.log(`[Screenshots] Rendered ${images.length} slide images`)
    return images
  } finally {
    await browser.close()
  }
}
