import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

export interface PdfOptions {
  format?: 'A4' | '16:9'
  landscape?: boolean
  title?: string
  brandName?: string
}

/**
 * Get browser instance for Vercel serverless.
 * --force-color-profile=srgb prevents Chrome's print engine from converting
 * colors to a different profile (the #1 cause of washed-out colors in PDF).
 */
async function getBrowser() {
  const isServerless = process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL

  const extraArgs = [
    '--force-color-profile=srgb',       // Keep sRGB colors — no print profile conversion
    '--disable-web-security',           // Load images from any origin
    '--allow-running-insecure-content',
  ]

  if (isServerless) {
    const executablePath = await chromium.executablePath()
    return puppeteer.launch({
      args: [...chromium.args, ...extraArgs],
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      headless: true,
    })
  } else {
    const executablePath = process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : '/usr/bin/google-chrome'

    return puppeteer.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', ...extraArgs],
    })
  }
}

/**
 * CSS injected into every slide page before PDF/screenshot rendering.
 * Fixes Chrome print engine quirks:
 * 1. print-color-adjust: exact — keeps all background colors & gradients
 * 2. -webkit-filter: blur(0) on shadowed elements — forces GPU compositing
 *    so box-shadow and text-shadow render correctly in page.pdf()
 */
const PRINT_FIX_CSS = `
  html, body, div {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  /* Force GPU compositing on elements with shadows — fixes box-shadow & text-shadow in print */
  [style*="box-shadow"], [style*="text-shadow"] {
    -webkit-filter: blur(0) !important;
  }
  /* ── PDF layered mode: neutralize backdrop-filter globally ──
     Chrome print engine skips GPU compositor effects. Disabling them prevents
     unrendered blur from leaving visual artifacts. Text-readability surfaces
     (thin backdrop-filter behind text) become invisible — which is correct.
     Glass cards get dedicated treatment below via .pdf-glass-card class. */
  * {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
  }
  /* Dedicated class for glassmorphism cards (grid items, stat cards, feature boxes).
     Author HTML must add this class to elements that should look like "surfaces". */
  .pdf-glass-card {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(20, 28, 45, 0.92) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 20px !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35) !important;
  }
  /* Legacy glass cards — detect by common patterns in HTML generated before
     the pdf-glass-card class was introduced. Backwards compat for existing
     decks in the DB. */
  .slide div[style*="backdrop-filter"][style*="border-radius"],
  .slide div[class*="card"][style*="backdrop-filter"],
  .slide div[class*="Card"][style*="backdrop-filter"] {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: rgba(20, 28, 45, 0.92) !important;
    border: 1px solid rgba(255, 255, 255, 0.08) !important;
    border-radius: 20px !important;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35) !important;
  }
  /* Image filter fallback: add dark overlay via box-shadow inset instead of filter */
  img[style*="brightness"], img[style*="filter"] {
    filter: none !important;
    -webkit-filter: none !important;
  }
`

/**
 * Common page setup: viewport, content, media type, fonts, images.
 */
async function setupPage(
  browser: Awaited<ReturnType<typeof getBrowser>>,
  html: string,
  opts: { width: number; height: number; deviceScaleFactor?: number; isFirst?: boolean },
) {
  const page = await browser.newPage()
  await page.setViewport({
    width: opts.width,
    height: opts.height,
    deviceScaleFactor: opts.deviceScaleFactor ?? 2,
  })

  // Force screen media type — prevents @media print rules from activating
  await page.emulateMediaType('screen')

  await page.setContent(html, { waitUntil: 'networkidle0' })

  // Inject print-fix CSS
  await page.addStyleTag({ content: PRINT_FIX_CSS })

  // Wait for fonts
  await page.evaluate(() => document.fonts?.ready)

  // Wait for all images to actually load (or fail)
  await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'))
    return Promise.all(imgs.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
            setTimeout(resolve, 8000)
          })
    ))
  })

  // Extra time for font rendering (first page needs more)
  await new Promise(resolve => setTimeout(resolve, opts.isFirst ? 1200 : 400))

  return page
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
    const page = await setupPage(browser, html, {
      width: options.format === '16:9' ? 1920 : 794,
      height: options.format === '16:9' ? 1080 : 1123,
      isFirst: true,
    })

    const pdfOptions = options.format === '16:9'
      ? { width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true }
      : { format: 'A4' as const, printBackground: true, preferCSSPageSize: true }

    const pdfBuffer = await page.pdf(pdfOptions)
    return Buffer.from(pdfBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * Generate multi-page PDF from array of HTML pages.
 * Uses page.pdf() with screen media emulation + sRGB color profile
 * so output is editable AND visually matches the editor.
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

    console.log(`[PDF] Rendering ${htmlPages.length} slides (screen media + sRGB)`)

    for (let i = 0; i < htmlPages.length; i++) {
      const page = await setupPage(browser, htmlPages[i], {
        width: 1920,
        height: 1080,
        isFirst: i === 0,
      })

      const pageBuffer = await page.pdf(pdfOpts)
      await page.close()

      const pagePdf = await PDFDocument.load(pageBuffer)
      const copiedPages = await mergedPdf.copyPages(pagePdf, pagePdf.getPageIndices())
      copiedPages.forEach(p => mergedPdf.addPage(p))
    }

    // Rich metadata
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
 * Generate multi-page PDF from HTML pages using SCREENSHOTS instead of page.pdf().
 * Screenshots render ALL CSS effects perfectly (backdrop-filter, radial-gradient,
 * box-shadow with spread, text-shadow glow, etc.) — unlike page.pdf() which
 * flattens these to solid blocks.
 *
 * Each slide is rendered as a 1920×1080 PNG screenshot, then embedded in a PDF page.
 */
export async function generateScreenshotPdf(
  htmlPages: string[],
  options: PdfOptions = {}
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  const browser = await getBrowser()

  try {
    const mergedPdf = await PDFDocument.create()

    console.log(`[PDF] Rendering ${htmlPages.length} slides via SCREENSHOT (full CSS fidelity)`)

    for (let i = 0; i < htmlPages.length; i++) {
      const page = await setupPage(browser, htmlPages[i], {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 2, // 2x for sharp output
        isFirst: i === 0,
      })

      // Take screenshot of the slide (captures ALL CSS effects perfectly)
      const screenshotBuffer = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      })
      await page.close()

      // Embed screenshot as a full-page image in PDF
      const pngImage = await mergedPdf.embedPng(screenshotBuffer)
      const pdfPage = mergedPdf.addPage([1920, 1080])
      pdfPage.drawImage(pngImage, {
        x: 0, y: 0, width: 1920, height: 1080,
      })
    }

    // Metadata
    mergedPdf.setTitle(options.title || 'Presentation')
    mergedPdf.setAuthor(options.brandName || 'Leaders')
    mergedPdf.setCreator('Leaders pptmaker — Screenshot PDF')
    mergedPdf.setCreationDate(new Date())

    const mergedBuffer = await mergedPdf.save()
    console.log(`[PDF] Screenshot PDF complete: ${htmlPages.length} pages, ${(mergedBuffer.length / 1024 / 1024).toFixed(1)} MB`)
    return Buffer.from(mergedBuffer)
  } finally {
    await browser.close()
  }
}

/**
 * Generate multi-page PDF by navigating to the React export-slides page.
 * This renders slides using the REAL React components (not ast-to-html),
 * ensuring aurora gradients, shadows, and all CSS effects render correctly.
 */
export async function generateReactPdf(
  documentId: string,
  options: PdfOptions = {}
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  const browser = await getBrowser()

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
      || 'http://localhost:3000'
    const exportUrl = `${baseUrl}/export-slides/${documentId}`

    console.log(`[PDF] React render: navigating to ${exportUrl}`)

    const page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 })
    await page.emulateMediaType('screen')

    await page.goto(exportUrl, { waitUntil: 'networkidle0', timeout: 30000 })

    // Inject print-fix CSS
    await page.addStyleTag({ content: PRINT_FIX_CSS })

    // Wait for fonts
    await page.evaluate(async () => {
      await document.fonts.ready
      await document.fonts.load('900 16px Heebo').catch(() => {})
      await document.fonts.load('300 16px Heebo').catch(() => {})
    })

    // Wait for all images
    await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'))
      return Promise.all(imgs.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
              setTimeout(resolve, 8000)
            })
      ))
    })

    // Wait for slides to render
    await page.waitForSelector('.slide[data-rendered="true"]', { timeout: 10000 }).catch(() => {
      console.warn('[PDF] No data-rendered slides found, proceeding anyway')
    })

    // Extra time for font rendering
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Count slides
    const slideCount = await page.$$eval('.slide', els => els.length)
    console.log(`[PDF] Found ${slideCount} slides`)

    if (slideCount === 0) {
      throw new Error('No slides rendered on export page')
    }

    // Generate PDF for each slide separately (better page control)
    const mergedPdf = await PDFDocument.create()
    const pdfOpts = { width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true }

    for (let i = 0; i < slideCount; i++) {
      // Hide all slides except current one
      await page.evaluate((idx) => {
        const slides = document.querySelectorAll('.slide')
        slides.forEach((s, j) => {
          (s as HTMLElement).style.display = j === idx ? 'block' : 'none'
        })
      }, i)

      const pageBuffer = await page.pdf(pdfOpts)
      const pagePdf = await PDFDocument.load(pageBuffer)
      const copiedPages = await mergedPdf.copyPages(pagePdf, pagePdf.getPageIndices())
      copiedPages.forEach(p => mergedPdf.addPage(p))
    }

    // Metadata
    mergedPdf.setTitle(options.title || 'Presentation')
    mergedPdf.setAuthor(options.brandName || 'Leaders')
    mergedPdf.setCreator('Leaders pptmaker — React PDF')
    mergedPdf.setCreationDate(new Date())

    const buffer = await mergedPdf.save()
    console.log(`[PDF] React PDF complete: ${slideCount} pages, ${(buffer.length / 1024).toFixed(0)} KB`)

    await page.close()
    return Buffer.from(buffer)
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
    const page = await setupPage(browser, html, {
      width: options.width || 1200,
      height: options.height || 800,
      isFirst: true,
    })

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' })
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
      const page = await setupPage(browser, htmlSlides[i], {
        width: 1920,
        height: 1080,
        deviceScaleFactor: 1, // PPTX doesn't need 2x
        isFirst: i === 0,
      })

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
