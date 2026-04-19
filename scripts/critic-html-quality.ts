/**
 * Critic Module 2: HTML Slide Quality Analyzer
 *
 * Loads a test document from Supabase and analyzes each HTML slide
 * for structure, 5-layer design, typography, visual variety, RTL, and accessibility.
 *
 * Run: npx tsx scripts/critic-html-quality.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CriticResult {
  module: string
  score: number
  passed: number
  failed: number
  warnings: number
  details: { name: string; status: 'pass' | 'fail' | 'warn'; message?: string }[]
}

interface SlideReport {
  index: number
  score: number
  details: { name: string; status: 'pass' | 'fail' | 'warn'; message?: string }[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function check(
  details: SlideReport['details'],
  name: string,
  condition: boolean,
  failMsg?: string
): boolean {
  if (condition) {
    details.push({ name, status: 'pass' })
  } else {
    details.push({ name, status: 'fail', message: failMsg ?? 'Check failed' })
  }
  return condition
}

// ---------------------------------------------------------------------------
// Per-slide analysis
// ---------------------------------------------------------------------------

function analyzeSlide(html: string, index: number): SlideReport {
  const details: SlideReport['details'] = []
  let points = 0

  // ---- Structure checks (10 pts) ----
  const structureChecks = 5
  const ptsPer = 10 / structureChecks

  if (check(details, `[${index}] DOCTYPE`, /<!DOCTYPE\s+html>/i.test(html))) points += ptsPer
  if (check(details, `[${index}] lang=he or dir=rtl`, /lang\s*=\s*["']he["']|dir\s*=\s*["']rtl["']/i.test(html))) points += ptsPer
  if (check(details, `[${index}] slide/1920x1080`, /\.slide|width\s*:\s*1920|height\s*:\s*1080/i.test(html))) points += ptsPer
  if (check(details, `[${index}] <style> tag`, /<style[\s>]/i.test(html))) points += ptsPer
  if (check(details, `[${index}] Heebo font`, /heebo/i.test(html))) points += ptsPer

  // ---- 5-Layer checks (25 pts, 5 each) ----
  const layerPts = 5

  // Layer 0: background
  if (check(details, `[${index}] L0 background`,
    /background-color|background\s*:\s*(?:linear-gradient|radial-gradient|#|rgb)|background-image/i.test(html)
  )) points += layerPts

  // Layer 1: glow / aurora
  if (check(details, `[${index}] L1 radial glow`,
    /radial-gradient/i.test(html)
  )) points += layerPts

  // Layer 2: accent line or decorative shape
  if (check(details, `[${index}] L2 accent/shape`,
    /(?:height|width)\s*:\s*[1-5]px|border-radius\s*:\s*\d/i.test(html)
  )) points += layerPts

  // Layer 3: Hebrew content
  if (check(details, `[${index}] L3 Hebrew text`,
    /[\u0590-\u05FF]/.test(html)
  )) points += layerPts

  // Layer 4: watermark / label / stripe
  if (check(details, `[${index}] L4 watermark/label/stripe`,
    /opacity\s*:\s*0\.0[0-9]|letter-spacing\s*:\s*[4-9]|letter-spacing\s*:\s*\d{2,}|height\s*:\s*[1-5]px.*100%/i.test(html)
  )) points += layerPts

  // ---- Typography (20 pts) ----
  const typoChecks = 4
  const typoPtsPer = 20 / typoChecks

  if (check(details, `[${index}] text-shadow`, /text-shadow/i.test(html))) points += typoPtsPer

  // font-size >= 48
  const fontSizes = html.match(/font-size\s*:\s*(\d+)/g) ?? []
  const maxFont = Math.max(0, ...fontSizes.map(m => parseInt(m.replace(/\D/g, ''), 10)))
  if (check(details, `[${index}] title font >= 48`, maxFont >= 48, `max font-size found: ${maxFont}`)) points += typoPtsPer

  // Multiple font-weights
  const weightMatches = html.match(/font-weight\s*:\s*(\d+|bold|normal|lighter|bolder)/gi) ?? []
  const uniqueWeights = new Set(weightMatches.map(w => w.replace(/font-weight\s*:\s*/i, '').trim().toLowerCase()))
  if (check(details, `[${index}] multiple font-weights`, uniqueWeights.size >= 2, `found ${uniqueWeights.size} unique weight(s)`)) points += typoPtsPer

  // letter-spacing
  if (check(details, `[${index}] letter-spacing`, /letter-spacing/i.test(html))) points += typoPtsPer

  // ---- RTL + Colors (15 pts) ----
  if (check(details, `[${index}] direction:rtl`, /direction\s*:\s*rtl|dir\s*=\s*["']rtl["']/i.test(html))) points += 7.5

  const hexColors = html.match(/#[0-9a-fA-F]{6}/g) ?? []
  if (check(details, `[${index}] design system colors`, hexColors.length >= 2, `found ${hexColors.length} hex color(s)`)) points += 7.5

  // ---- Accessibility (15 pts) ----
  const hasWhiteText = /color\s*:\s*(#fff(fff)?|white|rgb\(255\s*,\s*255\s*,\s*255\))/i.test(html)
  const hasWhiteBg = /background(-color)?\s*:\s*(#fff(fff)?|white|rgb\(255\s*,\s*255\s*,\s*255\))/i.test(html)
  if (check(details, `[${index}] no white-on-white`, !(hasWhiteText && hasWhiteBg))) points += 7.5

  const allSizes = (html.match(/font-size\s*:\s*(\d+)/g) ?? []).map(m => parseInt(m.replace(/\D/g, ''), 10))
  const tooSmall = allSizes.filter(s => s > 0 && s < 12)
  if (check(details, `[${index}] min font >= 12px`, tooSmall.length === 0, `found sizes < 12: ${tooSmall.join(', ')}`)) points += 7.5

  return { index, score: Math.round(points), details }
}

// ---------------------------------------------------------------------------
// Deck-level variety (15 pts)
// ---------------------------------------------------------------------------

function analyzeVariety(
  slides: string[],
  allDetails: CriticResult['details']
): number {
  let pts = 0

  // Backgrounds not all identical
  const bgSignatures = slides.map(h => {
    const bgMatch = h.match(/background(?:-color)?\s*:\s*([^;]+)/i)
    return bgMatch ? bgMatch[1].trim().toLowerCase() : ''
  })
  const uniqueBgs = new Set(bgSignatures.filter(Boolean))
  if (uniqueBgs.size > 1) {
    allDetails.push({ name: 'Variety: backgrounds differ', status: 'pass' })
    pts += 7.5
  } else {
    allDetails.push({ name: 'Variety: backgrounds differ', status: 'fail', message: `only ${uniqueBgs.size} unique background(s)` })
  }

  // At least 3 slides differ in structure
  const tagSignatures = slides.map(h => {
    const tags = (h.match(/<[a-z][a-z0-9]*[\s>]/gi) ?? []).map(t => t.replace(/[\s>]/g, '').toLowerCase())
    return tags.sort().join(',')
  })
  const uniqueStructures = new Set(tagSignatures)
  if (uniqueStructures.size >= 3) {
    allDetails.push({ name: 'Variety: 3+ structural variants', status: 'pass' })
    pts += 7.5
  } else {
    allDetails.push({ name: 'Variety: 3+ structural variants', status: 'warn', message: `only ${uniqueStructures.size} variant(s)` })
    pts += 3
  }

  return pts
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runHtmlQualityAnalysis(): Promise<CriticResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: doc, error } = await supabase
    .from('documents')
    .select('data')
    .eq('id', TEST_DOC_ID)
    .single()

  if (error || !doc) {
    return {
      module: 'html-quality',
      score: 0,
      passed: 0,
      failed: 1,
      warnings: 0,
      details: [{ name: 'Load document', status: 'fail', message: error?.message ?? 'Document not found' }]
    }
  }

  const htmlSlides: string[] = doc.data?._htmlPresentation?.htmlSlides ?? []

  if (htmlSlides.length === 0) {
    return {
      module: 'html-quality',
      score: 0,
      passed: 0,
      failed: 1,
      warnings: 0,
      details: [{ name: 'HTML slides exist', status: 'fail', message: 'No htmlSlides found in document' }]
    }
  }

  const slideReports: SlideReport[] = htmlSlides.map((html, i) => analyzeSlide(html, i))

  // Aggregate
  const allDetails: CriticResult['details'] = []
  for (const sr of slideReports) {
    allDetails.push(...sr.details)
  }

  // Variety checks
  const varietyPts = analyzeVariety(htmlSlides, allDetails)

  // Per-slide average (out of 85 per-slide max) + variety (15)
  const avgSlideScore = slideReports.reduce((s, r) => s + r.score, 0) / slideReports.length
  const deckScore = Math.round(Math.min(100, avgSlideScore + varietyPts))

  const passed = allDetails.filter(d => d.status === 'pass').length
  const failed = allDetails.filter(d => d.status === 'fail').length
  const warnings = allDetails.filter(d => d.status === 'warn').length

  return {
    module: 'html-quality',
    score: deckScore,
    passed,
    failed,
    warnings,
    details: allDetails
  }
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Critic Module 2: HTML Slide Quality Analyzer ===\n')

  const result = await runHtmlQualityAnalysis()

  console.log(`Deck score: ${result.score}/100`)
  console.log(`Passed: ${result.passed}  Failed: ${result.failed}  Warnings: ${result.warnings}\n`)

  for (const d of result.details) {
    const icon = d.status === 'pass' ? '  \u2705' : d.status === 'fail' ? '  \u274C' : '  \u26A0\uFE0F '
    console.log(`${icon} ${d.name}${d.message ? ` \u2014 ${d.message}` : ''}`)
  }

  console.log('')
  process.exit(result.failed > 0 ? 1 : 0)
}

const isMain = require.main === module || process.argv[1]?.endsWith('critic-html-quality.ts')
if (isMain && !process.env.__CRITIC_IMPORTED) {
  main().catch(e => {
    console.error('Fatal:', e)
    process.exit(2)
  })
}
export async function run() { return runHtmlQualityAnalysis() }
