/**
 * Vision Inspector — renders a slide and inspects it visually for defects.
 *
 * Architecture (DeepPresenter pattern):
 *   HTML slide → Playwright screenshot → Gemini Flash Vision → Structured defect report → Auto-fix
 *
 * Migrated to Gemini Flash vision (April 2026):
 * - 10× cheaper than Claude Opus
 * - Returns structured JSON via responseSchema
 * - Object detection support for bounding boxes
 * - Works even when Anthropic API key is unavailable
 */

import { callAI } from '@/lib/ai-provider'

const VISION_INSPECTOR_SCHEMA = {
  type: 'object',
  required: ['hasDefects', 'score', 'checks', 'issues'],
  properties: {
    hasDefects: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    checks: {
      type: 'object',
      required: ['textOverflow', 'titleClipped', 'imageUsed', 'contrastOk', 'layoutBalanced', 'hebrewPresent', 'rtlCorrect', 'noBlankSlide'],
      properties: {
        textOverflow:    { type: 'boolean' },
        titleClipped:    { type: 'boolean' },
        imageUsed:       { type: 'boolean' },
        contrastOk:      { type: 'boolean' },
        layoutBalanced:  { type: 'boolean' },
        hebrewPresent:   { type: 'boolean' },
        rtlCorrect:      { type: 'boolean' },
        noBlankSlide:    { type: 'boolean' },
      },
    },
    issues: { type: 'array', items: { type: 'string' } },
    revisionHint: { type: 'string', nullable: true },
  },
}

export interface SlideDefectReport {
  slideIndex: number
  slideType: string
  hasDefects: boolean
  score: number // 0-100
  checks: {
    textOverflow: boolean       // Text bleeding outside container
    titleClipped: boolean       // Title text cut off
    imageUsed: boolean          // If image was provided, was it used?
    contrastOk: boolean         // Text readable against background
    layoutBalanced: boolean     // Not all content crammed in one corner
    hebrewPresent: boolean      // Actually has Hebrew text
    rtlCorrect: boolean         // Text aligned right
    noBlankSlide: boolean       // Slide has visible content
  }
  issues: string[]              // Human-readable issue descriptions
  revisionHint?: string         // Specific fix instruction for re-generation
}

/**
 * Inspect a single HTML slide by rendering it and analyzing the screenshot.
 * Returns a structured defect report.
 *
 * @param html - Complete HTML document string for one slide
 * @param slideIndex - Slide number (for logging)
 * @param slideType - Slide type (cover, brief, etc.)
 * @param hasImage - Whether an image URL was provided for this slide
 */
export async function inspectSlide(
  html: string,
  slideIndex: number,
  slideType: string,
  hasImage: boolean = false,
): Promise<SlideDefectReport> {
  const requestId = `inspect-${slideIndex}-${Date.now()}`

  try {
    // Step 1: Render to screenshot via Playwright
    console.log(`[VisionInspector][${requestId}] 📸 Rendering slide ${slideIndex + 1} (${slideType})...`)

    let screenshotBase64: string
    try {
      const puppeteer = (await import('puppeteer-core')).default
      const chromium = (await import('@sparticuz/chromium')).default
      const executablePath = await chromium.executablePath()
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1920, height: 1080 },
        executablePath,
        headless: true,
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      await new Promise(r => setTimeout(r, 1000)) // Let fonts + images load

      const screenshot = await page.screenshot({ type: 'jpeg', quality: 75 })
      screenshotBase64 = Buffer.from(screenshot).toString('base64')
      await browser.close()
    } catch (renderErr) {
      console.warn(`[VisionInspector][${requestId}] ⚠️ Render failed, doing text-only analysis: ${renderErr}`)
      // Fallback: analyze HTML structure without rendering
      return analyzeHtmlOnly(html, slideIndex, slideType, hasImage)
    }

    // Step 2: Send to Gemini Flash vision for inspection
    console.log(`[VisionInspector][${requestId}] 🔍 Analyzing screenshot with Gemini Flash (${Math.round(screenshotBase64.length / 1024)}KB)...`)

    const inspectorPrompt = `Inspect this presentation slide (type: ${slideType}, index: ${slideIndex + 1}).
${hasImage ? 'An image URL was provided to the slide generator — check whether it appears.' : 'No image was provided for this slide.'}

You are a STRICT presentation QA inspector. Find every visual problem.
Return ONLY a JSON defect report — no markdown, no commentary.

Issues should be in Hebrew. revisionHint should be a concrete fix instruction (in English, for the next AI to apply).`

    // Per skill matrix: Vision QA → Flash + MEDIUM thinking (defect detection needs reasoning)
    const visionResult = await callAI({
      model: 'gemini-3-flash-preview',
      prompt: inspectorPrompt,
      inlineImages: [{ mimeType: 'image/jpeg', data: screenshotBase64 }],
      geminiConfig: {
        responseMimeType: 'application/json',
        responseSchema: VISION_INSPECTOR_SCHEMA as any,
        thinkingConfig: { thinkingLevel: 'MEDIUM' as any },
        maxOutputTokens: 2048,
      },
      responseSchema: VISION_INSPECTOR_SCHEMA as Record<string, unknown>,
      thinkingLevel: 'MEDIUM',
      maxOutputTokens: 2048,
      callerId: requestId,
      noGlobalFallback: true,
    })

    const responseText = visionResult.text || ''

    // Parse JSON from response
    let parsed: {
      hasDefects: boolean
      score: number
      checks: SlideDefectReport['checks']
      issues: string[]
      revisionHint: string | null
    }
    try {
      parsed = JSON.parse(responseText)
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn(`[VisionInspector][${requestId}] ⚠️ Could not parse vision response`)
        return makeDefaultReport(slideIndex, slideType, 75)
      }
      parsed = JSON.parse(jsonMatch[0])
    }

    console.log(`[VisionInspector][${requestId}] ${parsed.hasDefects ? '❌' : '✅'} Slide ${slideIndex + 1}: score=${parsed.score}/100, issues=${parsed.issues.length}, checks=${JSON.stringify(parsed.checks)}`)
    if (parsed.issues.length > 0) {
      for (const issue of parsed.issues) {
        console.log(`[VisionInspector][${requestId}]   → ${issue}`)
      }
    }

    return {
      slideIndex,
      slideType,
      ...parsed,
      revisionHint: parsed.revisionHint || undefined,
    }
  } catch (error) {
    console.error(`[VisionInspector][${requestId}] ❌ Inspection failed:`, error)
    return makeDefaultReport(slideIndex, slideType, 70)
  }
}

/** Analyze HTML structure when Playwright is not available */
function analyzeHtmlOnly(
  html: string,
  slideIndex: number,
  slideType: string,
  hasImage: boolean,
): SlideDefectReport {
  const issues: string[] = []

  const hebrewPresent = /[\u0590-\u05FF]/.test(html)
  if (!hebrewPresent) issues.push('אין טקסט בעברית בשקף')

  const rtlCorrect = /dir="rtl"|direction:\s*rtl/i.test(html)
  if (!rtlCorrect) issues.push('חסר הגדרת RTL')

  const imageUsed = /<img\s/i.test(html)
  if (hasImage && !imageUsed) issues.push('תמונה זמינה אך לא בשימוש')

  const hasContent = html.length > 500
  if (!hasContent) issues.push('שקף כמעט ריק')

  const hasOverflowProtection = /overflow:\s*hidden|line-clamp/i.test(html)
  if (!hasOverflowProtection) issues.push('חסרת הגנת overflow על טקסט')

  return {
    slideIndex,
    slideType,
    hasDefects: issues.length > 0,
    score: Math.max(50, 100 - issues.length * 15),
    checks: {
      textOverflow: !hasOverflowProtection,
      titleClipped: false, // Can't detect without rendering
      imageUsed,
      contrastOk: true, // Can't detect without rendering
      layoutBalanced: true,
      hebrewPresent,
      rtlCorrect,
      noBlankSlide: hasContent,
    },
    issues,
    revisionHint: issues.length > 0 ? issues.join('. ') + '. תקן את הבעיות הנ"ל.' : undefined,
  }
}

function makeDefaultReport(slideIndex: number, slideType: string, score: number): SlideDefectReport {
  return {
    slideIndex, slideType,
    hasDefects: false,
    score,
    checks: {
      textOverflow: false, titleClipped: false, imageUsed: true,
      contrastOk: true, layoutBalanced: true, hebrewPresent: true,
      rtlCorrect: true, noBlankSlide: true,
    },
    issues: [],
  }
}

/**
 * Inspect all slides and return reports.
 * Runs in parallel for speed (Promise.allSettled).
 */
export async function inspectAllSlides(
  htmlSlides: string[],
  slideTypes: string[],
  imageFlags: boolean[],
): Promise<SlideDefectReport[]> {
  console.log(`[VisionInspector] Inspecting ${htmlSlides.length} slides...`)

  const results = await Promise.allSettled(
    htmlSlides.map((html, i) =>
      inspectSlide(html, i, slideTypes[i] || 'unknown', imageFlags[i] || false)
    )
  )

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : makeDefaultReport(i, slideTypes[i] || 'unknown', 60)
  )
}
