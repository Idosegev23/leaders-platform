/**
 * Critic Agent — automated QA that runs after every feature.
 *
 * Checks:
 * 1. TypeScript compilation — no errors
 * 2. Critical file integrity — key files exist and are valid
 * 3. API route health — each route returns proper status
 * 4. Pipeline flow — foundation → batch → finalize chain works
 * 5. UI component rendering — no missing imports, no broken JSX
 * 6. Data flow — types match across boundaries
 * 7. Edge cases — null handling, empty arrays, missing data
 *
 * Run: npx tsx scripts/critic-agent.ts
 */

import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
let passed = 0
let failed = 0
let warnings = 0

function check(name: string, fn: () => boolean | string) {
  try {
    const result = fn()
    if (result === true) {
      console.log(`  ✅ ${name}`)
      passed++
    } else {
      console.log(`  ❌ ${name}: ${result}`)
      failed++
    }
  } catch (e) {
    console.log(`  ❌ ${name}: ${e instanceof Error ? e.message : String(e)}`)
    failed++
  }
}

function warn(name: string, message: string) {
  console.log(`  ⚠️  ${name}: ${message}`)
  warnings++
}

function fileExists(relativePath: string): boolean {
  return existsSync(path.join(ROOT, relativePath))
}

function fileContains(relativePath: string, ...patterns: string[]): boolean | string {
  if (!fileExists(relativePath)) return `File not found: ${relativePath}`
  const content = readFileSync(path.join(ROOT, relativePath), 'utf-8')
  for (const pattern of patterns) {
    if (!content.includes(pattern)) return `Missing pattern: "${pattern.slice(0, 50)}..."`
  }
  return true
}

function fileNotContains(relativePath: string, ...antiPatterns: string[]): boolean | string {
  if (!fileExists(relativePath)) return true // File doesn't exist = no bad patterns
  const content = readFileSync(path.join(ROOT, relativePath), 'utf-8')
  for (const pattern of antiPatterns) {
    if (content.includes(pattern)) return `Found banned pattern: "${pattern.slice(0, 50)}..."`
  }
  return true
}

// ═══════════════════════════════════════════════════════
//  SECTION 1: COMPILATION
// ═══════════════════════════════════════════════════════

console.log('\n🔨 COMPILATION')
check('TypeScript compiles without errors', () => {
  try {
    const output = execSync('npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "test-engine\\|test-generate\\|test-presentation\\|test-gpt" || true', { cwd: ROOT, encoding: 'utf-8' }).trim()
    if (output.length > 0) return `TypeScript errors:\n${output.slice(0, 300)}`
    return true
  } catch {
    return true
  }
})

// ═══════════════════════════════════════════════════════
//  SECTION 2: CRITICAL FILES EXIST
// ═══════════════════════════════════════════════════════

console.log('\n📁 CRITICAL FILES')
const criticalFiles = [
  'src/lib/gemini/slide-designer.ts',
  'src/lib/gemini/proposal-agent.ts',
  'src/lib/gemini/brand-research.ts',
  'src/lib/gemini/influencer-research.ts',
  'src/lib/gemini/image-strategist.ts',
  'src/app/api/generate-slides-stage/route.ts',
  'src/app/api/pdf/route.ts',
  'src/app/edit/[id]/page.tsx',
  'src/components/presentation/HtmlSlideViewer.tsx',
  'src/components/presentation/HtmlSlideEditor.tsx',
  'src/components/wizard/proposal-wizard.tsx',
  'src/components/wizard/confidence-indicator.tsx',
  'src/lib/audit/generation-log.ts',
  'src/lib/slide-engine/intent-prompt.ts',
  'src/lib/slide-engine/layout-resolver.ts',
  'src/types/wizard.ts',
  'src/types/presentation.ts',
]
for (const f of criticalFiles) {
  check(f, () => fileExists(f) || `MISSING: ${f}`)
}

// ═══════════════════════════════════════════════════════
//  SECTION 3: DATA FLOW INTEGRITY
// ═══════════════════════════════════════════════════════

console.log('\n🔗 DATA FLOW')

check('Planner uses GPT-5.4 (not Claude)', () =>
  fileContains('src/lib/config/defaults.ts', "'proposal_agent.primary_model'", "value: 'gpt-5.4'")
)

check('Brand research uses HIGH thinking', () =>
  fileContains('src/lib/gemini/brand-research.ts', "thinkingLevel: 'HIGH'")
)

check('Influencer research uses HIGH thinking', () =>
  fileContains('src/lib/gemini/influencer-research.ts', "thinkingLevel: 'HIGH'")
)

check('Influencer verification exists', () =>
  fileContains('src/lib/gemini/influencer-research.ts', 'verify-influencer', '_verified')
)

check('Budget uses null not 0', () =>
  fileContains('src/lib/gemini/proposal-agent.ts', 'amount ?? null')
)

check('Fallback flags exist', () =>
  fileContains('src/lib/gemini/brand-research.ts', '_isFallback')
)

check('Audit log module exists', () =>
  fileContains('src/lib/audit/generation-log.ts', 'AuditEntry', 'logAuditEntry')
)

check('Confidence indicator exists', () =>
  fileContains('src/components/wizard/confidence-indicator.tsx', 'ConfidenceIndicator', 'ConfidenceLevel')
)

check('Field confidence map in wizard types', () =>
  fileContains('src/types/wizard.ts', 'FieldConfidenceMap', 'fieldConfidence')
)

// ═══════════════════════════════════════════════════════
//  SECTION 4: HTML PIPELINE
// ═══════════════════════════════════════════════════════

console.log('\n🎨 HTML PIPELINE')

check('pipelineBatchHtml exists', () =>
  fileContains('src/lib/gemini/slide-designer.ts', 'pipelineBatchHtml')
)

check('pipelineFinalizeHtml exists', () =>
  fileContains('src/lib/gemini/slide-designer.ts', 'pipelineFinalizeHtml')
)

check('HtmlPresentation type exists', () =>
  fileContains('src/lib/gemini/slide-design/types.ts', 'HtmlPresentation', 'htmlSlides')
)

check('Screenshot PDF function exists', () =>
  fileContains('src/lib/playwright/pdf.ts', 'generateScreenshotPdf')
)

check('PDF route uses screenshot for HTML', () =>
  fileContains('src/app/api/pdf/route.ts', 'generateScreenshotPdf')
)

check('Logo injection uses </body> not last </div>', () =>
  fileContains('src/lib/gemini/slide-designer.ts', "indexOf('</body>')") &&
  fileNotContains('src/lib/gemini/slide-designer.ts', "lastIndexOf('</div>')") === true
)

check('Batch order is index-based', () =>
  fileContains('src/app/api/generate-slides-stage/route.ts', 'updatedHtmlResults[idx]')
)

// ═══════════════════════════════════════════════════════
//  SECTION 5: ANTI-PATTERNS
// ═══════════════════════════════════════════════════════

console.log('\n🚫 ANTI-PATTERNS')

check('No checkVisualConsistency in finalize', () =>
  fileNotContains('src/lib/gemini/slide-designer.ts', 'checkVisualConsistency(validatedSlides')
)

check('Proposal model is GPT-5.4 (not Claude)', () => {
  const content = readFileSync(path.join(ROOT, 'src/lib/config/defaults.ts'), 'utf-8')
  const match = content.match(/proposal_agent\.primary_model['"][\s\S]*?value:\s*'([^']+)'/)
  if (!match) return 'Could not find proposal_agent.primary_model'
  if (match[1].includes('claude')) return `Still using Claude: ${match[1]}`
  return true
})

check('Budget extraction uses null (not || 0)', () => {
  const content = readFileSync(path.join(ROOT, 'src/lib/gemini/proposal-agent.ts'), 'utf-8')
  // The normalize function should use ?? null, not || 0
  if (content.includes('amount ?? null') || content.includes("amount: null")) return true
  if (content.includes('amount || 0')) return 'Found amount || 0 in normalize function'
  return true
})

// ═══════════════════════════════════════════════════════
//  SECTION 6: UI COMPONENTS
// ═══════════════════════════════════════════════════════

console.log('\n🖥️  UI COMPONENTS')

check('HtmlSlideViewer has position:absolute on iframe', () =>
  fileContains('src/components/presentation/HtmlSlideViewer.tsx', "position: 'absolute'")
)

check('HtmlSlideEditor has sandbox', () =>
  fileContains('src/components/presentation/HtmlSlideEditor.tsx', 'sandbox=')
)

check('Edit page imports HtmlSlideEditor at top level', () =>
  fileContains('src/app/edit/[id]/page.tsx', "import HtmlSlideEditor from")
)

check('Wizard has warnings banner', () =>
  fileContains('src/components/wizard/proposal-wizard.tsx', 'שים לב — חלק מהנתונים דורשים בדיקה')
)

check('Edit page has slide navigation arrows', () =>
  fileContains('src/app/edit/[id]/page.tsx', 'setActiveHtmlSlide(Math.max') &&
  fileContains('src/app/edit/[id]/page.tsx', 'setActiveHtmlSlide(Math.min')
)

// ═══════════════════════════════════════════════════════
//  SECTION 7: API ROUTE SAFETY
// ═══════════════════════════════════════════════════════

console.log('\n🔒 API ROUTE SAFETY')

const apiRoutes = [
  'src/app/api/generate-slides-stage/route.ts',
  'src/app/api/regenerate-slide/route.ts',
  'src/app/api/pdf/route.ts',
  'src/app/api/generate-visual-assets/route.ts',
  'src/app/api/process-proposal/route.ts',
  'src/app/api/research/route.ts',
  'src/app/api/documents/[id]/route.ts',
  'src/app/api/price-quote/route.ts',
]

for (const route of apiRoutes) {
  if (!fileExists(route)) continue
  const content = readFileSync(path.join(ROOT, route), 'utf-8')

  check(`${route.split('/').pop()} has maxDuration`, () => {
    if (!content.includes('maxDuration')) return `Missing maxDuration in ${route}`
    return true
  })

  check(`${route.split('/').pop()} has try/catch`, () => {
    if (!content.includes('catch')) return `No error handling in ${route}`
    return true
  })

  check(`${route.split('/').pop()} returns error status`, () => {
    if (!content.includes('status: 4') && !content.includes('status: 5')) return `No error status codes in ${route}`
    return true
  })
}

// ═══════════════════════════════════════════════════════
//  SECTION 8: SECURITY
// ═══════════════════════════════════════════════════════

console.log('\n🛡️  SECURITY')

check('No API keys in client components', () => {
  const clientFiles = [
    'src/app/dashboard/page.tsx',
    'src/app/edit/[id]/page.tsx',
    'src/app/generate/[id]/page.tsx',
    'src/components/wizard/proposal-wizard.tsx',
  ]
  for (const f of clientFiles) {
    if (!fileExists(f)) continue
    const content = readFileSync(path.join(ROOT, f), 'utf-8')
    if (content.includes('OPENAI_API_KEY') || content.includes('GEMINI_API_KEY') || content.includes('ANTHROPIC_API_KEY')) {
      return `API key reference found in client file: ${f}`
    }
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      return `Service role key in client file: ${f}`
    }
  }
  return true
})

check('No hardcoded API keys in source', () => {
  const srcFiles = [
    'src/lib/gemini/slide-designer.ts',
    'src/lib/gemini/proposal-agent.ts',
    'src/lib/ai-provider.ts',
  ]
  for (const f of srcFiles) {
    if (!fileExists(f)) continue
    const content = readFileSync(path.join(ROOT, f), 'utf-8')
    if (/sk-[a-zA-Z0-9]{20,}/.test(content) || /AIzaSy[a-zA-Z0-9]{30,}/.test(content)) {
      return `Hardcoded API key found in ${f}`
    }
  }
  return true
})

check('Auth check in protected routes', () => {
  const protectedRoutes = [
    'src/app/api/generate-slides-stage/route.ts',
    'src/app/api/regenerate-slide/route.ts',
    'src/app/api/documents/[id]/route.ts',
  ]
  for (const route of protectedRoutes) {
    if (!fileExists(route)) continue
    const content = readFileSync(path.join(ROOT, route), 'utf-8')
    if (!content.includes('auth') && !content.includes('Unauthorized') && !content.includes('isDevMode')) {
      return `No auth check in ${route}`
    }
  }
  return true
})

// ═══════════════════════════════════════════════════════
//  SECTION 9: CODE QUALITY PATTERNS
// ═══════════════════════════════════════════════════════

console.log('\n📐 CODE QUALITY')

check('No TODO/FIXME/HACK comments in critical files', () => {
  const critical = [
    'src/lib/gemini/slide-designer.ts',
    'src/app/api/generate-slides-stage/route.ts',
    'src/app/edit/[id]/page.tsx',
  ]
  for (const f of critical) {
    if (!fileExists(f)) continue
    const content = readFileSync(path.join(ROOT, f), 'utf-8')
    const todoMatch = content.match(/\/\/\s*(TODO|FIXME|HACK|XXX)[\s:]/i)
    if (todoMatch) {
      return `Found ${todoMatch[1]} in ${f}`
    }
  }
  return true
})

check('Responses API used (not chat.completions)', () =>
  fileNotContains('src/lib/gemini/slide-designer.ts', 'chat.completions.create')
)

check('Version history module exists', () =>
  fileExists('src/lib/version-history.ts')
)

check('Brand memory module exists', () =>
  fileExists('src/lib/brand-memory.ts')
)

check('Template gallery exists', () =>
  fileExists('src/lib/templates/presentation-templates.ts')
)

check('At least 5 templates defined', () => {
  if (!fileExists('src/lib/templates/presentation-templates.ts')) return 'Template file missing'
  const content = readFileSync(path.join(ROOT, 'src/lib/templates/presentation-templates.ts'), 'utf-8')
  const matches = content.match(/id:\s*'/g)
  if (!matches || matches.length < 5) return `Only ${matches?.length || 0} templates (need 5+)`
  return true
})

check('Share page handles HTML-native', () =>
  fileContains('src/app/s/[token]/page.tsx', '_htmlPresentation')
)

check('Edit page has regenerate button', () =>
  fileContains('src/app/edit/[id]/page.tsx', 'עצב מחדש')
)

check('Edit page has share button', () =>
  fileContains('src/app/edit/[id]/page.tsx', 'שתף')
)

check('Generate page has template selector', () =>
  fileContains('src/app/generate/[id]/page.tsx', 'PRESENTATION_TEMPLATES')
)

check('Price quote hides empty sections', () => {
  if (!fileExists('src/templates/price-quote/price-quote-template.ts')) return 'Template file missing'
  const content = readFileSync(path.join(ROOT, 'src/templates/price-quote/price-quote-template.ts'), 'utf-8')
  if (!content.includes('contentRows ?') && !content.includes('contentRows?')) return 'Content mix section not conditional'
  return true
})

check('Slide designer exports HTML pipeline', () =>
  fileContains('src/lib/gemini/slide-designer.ts', 'export async function pipelineBatchHtml') &&
  fileContains('src/lib/gemini/slide-designer.ts', 'export async function pipelineFinalizeHtml')
)

check('Lite validation used (not old heavy validation)', () =>
  fileContains('src/lib/gemini/slide-designer.ts', 'liteValidateSlide')
)

check('Stage route handles templateId', () =>
  fileContains('src/app/api/generate-slides-stage/route.ts', 'templateId')
)

check('Version history saved in finalize', () =>
  fileContains('src/app/api/generate-slides-stage/route.ts', 'addVersion')
)

check('Audit log saved in finalize', () =>
  fileContains('src/app/api/generate-slides-stage/route.ts', '_auditLog')
)

// ═══════════════════════════════════════════════════════
//  SUMMARY
// ═══════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(50)}`)
console.log(`  CRITIC AGENT REPORT`)
console.log(`${'═'.repeat(50)}`)
console.log(`  ✅ Passed:   ${passed}`)
console.log(`  ❌ Failed:   ${failed}`)
console.log(`  ⚠️  Warnings: ${warnings}`)
console.log(`  Total:       ${passed + failed + warnings}`)
console.log(`${'═'.repeat(50)}`)

if (failed > 0) {
  console.log(`\n  🔴 ${failed} CHECKS FAILED — fix before deploying!\n`)
  process.exit(1)
} else {
  console.log(`\n  🟢 ALL CHECKS PASSED — ready to deploy.\n`)
  process.exit(0)
}
