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
export async function getBrowser() {
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
 * Split each A4 page into sheet-sized pieces, cloning the page's full frame
 * (header + footer) around every piece. Exported so the pagination can be
 * asserted directly, without going through a PDF.
 */
export async function splitPagesIntoSheets(
  browser: Awaited<ReturnType<typeof getBrowser>>,
  htmlPages: string[],
): Promise<string[]> {
  // Measure every page first, so the log below reports the real sheet count.
  const sheets: string[] = []
  for (let i = 0; i < htmlPages.length; i++) {
    const page = await setupPage(browser, htmlPages[i], {
      width: 794,
      height: 1123,
      isFirst: i === 0,
    })
    /**
    * Browser-side splitter for A4 documents.
    *
    * Chrome's print engine will happily fragment a page that doesn't fit, but it
    * repeats neither `thead`/`tfoot` nor `position: fixed` across the resulting
    * sheets — so the continuation sheet loses its header and its footer floats up
    * to wherever the content happened to end. Verified against page.pdf(), not
    * assumed.
    *
    * So we paginate before printing instead: measure the page's content blocks,
    * group them into sheet-sized runs, and clone the full header/footer frame
    * around each run. Every sheet then renders as a complete, self-contained page.
    *
    * Runs inside the browser via page.evaluate — it needs real layout boxes.
    */
    const split = await page.evaluate(() => {
      const SHEET_H = 1122.5 // A4 at 96dpi
      const content = document.querySelector('.content') as HTMLElement | null
      const header = document.querySelector('.header') as HTMLElement | null
      const footer = document.querySelector('.footer') as HTMLElement | null
      if (!content || !header || !footer) return [document.documentElement.outerHTML]

      const blocks = Array.from(content.children) as HTMLElement[]
      if (blocks.length === 0) return [document.documentElement.outerHTML]

      const cs = getComputedStyle(content)
      const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      const available =
        SHEET_H - header.getBoundingClientRect().height - footer.getBoundingClientRect().height - padding

      const rects = blocks.map(b => b.getBoundingClientRect())
      // getBoundingClientRect excludes margins. The gaps *between* blocks are
      // already baked into the span from the group's first top to a block's
      // bottom, but the first block's top margin and the last block's bottom
      // margin reappear once the group is cloned onto its own sheet — so they
      // have to be added back or the sheet overflows by exactly that much.
      const marginTop = blocks.map(b => parseFloat(getComputedStyle(b).marginTop) || 0)
      const marginBottom = blocks.map(b => parseFloat(getComputedStyle(b).marginBottom) || 0)
      const EPSILON = 2 // absorb sub-pixel rounding rather than spill a sheet

      const groups: number[][] = []
      let current: number[] = []
      let first = 0

      blocks.forEach((_, i) => {
        const height =
          marginTop[first] + (rects[i].bottom - rects[first].top) + marginBottom[i]
        if (current.length > 0 && height > available - EPSILON) {
          groups.push(current)
          current = [i]
          first = i
        } else {
          current.push(i)
        }
      })
      if (current.length > 0) groups.push(current)

      // A section label stranded at the foot of a sheet belongs with the block it
      // introduces, so push it forward.
      const LABELS = ['section-header', 'section-header-dark']
      for (let g = 0; g < groups.length - 1; g++) {
        for (;;) {
          const last = groups[g][groups[g].length - 1]
          if (groups[g].length <= 1 || !LABELS.some(c => blocks[last].classList.contains(c))) break
          groups[g + 1].unshift(groups[g].pop() as number)
        }
      }

      if (groups.length === 1) return [document.documentElement.outerHTML]

      return groups.map(group => {
        const clone = document.documentElement.cloneNode(true) as HTMLElement
        const cloneContent = clone.querySelector('.content') as HTMLElement
        const keep = new Set(group)
        Array.from(cloneContent.children).forEach((el, i) => {
          if (!keep.has(i)) el.remove()
        })
        return clone.outerHTML
      })
    })
    await page.close()
    if (split.length > 1) {
      console.log(`[PDF] page ${i + 1} overflows — split across ${split.length} sheets`)
    }
    sheets.push(...split.map(html => (html.startsWith('<!DOCTYPE') ? html : `<!DOCTYPE html>${html}`)))
  }
  return sheets
}

/**
 * Generate a multi-page A4 PDF, splitting any page whose content overflows the
 * sheet so that every sheet keeps its own header and bottom-anchored footer.
 * Use this for A4 documents; generateMultiPagePdf() is for fixed-size slides.
 */
export async function generatePaginatedA4Pdf(
  htmlPages: string[],
  options: PdfOptions = {}
): Promise<Buffer> {
  const { PDFDocument } = await import('pdf-lib')
  const browser = await getBrowser()

  try {
    const mergedPdf = await PDFDocument.create()
    const pdfOpts = { format: 'A4' as const, printBackground: true, preferCSSPageSize: true }

    const sheets = await splitPagesIntoSheets(browser, htmlPages)

    console.log(`[PDF] Rendering ${sheets.length} A4 sheets from ${htmlPages.length} pages`)

    for (let i = 0; i < sheets.length; i++) {
      const page = await setupPage(browser, sheets[i], { width: 794, height: 1123 })
      const buffer = await page.pdf(pdfOpts)
      await page.close()

      const sheetPdf = await PDFDocument.load(buffer)
      const copied = await mergedPdf.copyPages(sheetPdf, sheetPdf.getPageIndices())
      copied.forEach(p => mergedPdf.addPage(p))
    }

    mergedPdf.setTitle(options.title || 'Document')
    mergedPdf.setAuthor(options.brandName || 'Leaders')
    mergedPdf.setCreator('Leaders platform')
    mergedPdf.setCreationDate(new Date())
    mergedPdf.setModificationDate(new Date())

    return Buffer.from(await mergedPdf.save())
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

    // Render slides CONCURRENTLY (3 pages per browser) — the serial loop made
    // a 15-slide download take minutes. Order is preserved by index.
    // JPEG, not PNG: PNG at high scale blew past Supabase Storage's max object
    // size ("The object exceeded the maximum allowed size"); q88 is visually
    // equivalent at ~1/10 the bytes. Scale 1.5 (2880px wide) stays sharp.
    const shots: Buffer[] = new Array(htmlPages.length)
    let nextIdx = 0
    const renderWorker = async (): Promise<void> => {
      for (;;) {
        const i = nextIdx++
        if (i >= htmlPages.length) return
        const page = await setupPage(browser, htmlPages[i], {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1.5,
          isFirst: i === 0,
        })
        const screenshotBuffer = await page.screenshot({
          type: 'jpeg',
          quality: 88,
          clip: { x: 0, y: 0, width: 1920, height: 1080 },
          // captureBeyondViewport:true (the default when `clip` is set) re-renders
          // the page in a mode that paints WHITE when the root element is dir="rtl"
          // — every Hebrew slide comes out blank. Pin it off so RTL decks render.
          captureBeyondViewport: false,
        })
        await page.close()
        shots[i] = Buffer.from(screenshotBuffer)
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, htmlPages.length) }, renderWorker))

    for (const shot of shots) {
      const jpgImage = await mergedPdf.embedJpg(shot)
      const pdfPage = mergedPdf.addPage([1920, 1080])
      pdfPage.drawImage(jpgImage, { x: 0, y: 0, width: 1920, height: 1080 })
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
        // See note in generateMultiPagePdf: dir="rtl" root + default
        // captureBeyondViewport paints a blank white frame. Keep it off.
        captureBeyondViewport: false,
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
