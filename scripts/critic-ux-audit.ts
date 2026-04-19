/**
 * Critic Module 5: UX Flow Audit
 *
 * Reads page/component files and verifies they contain the required
 * UI elements, Hebrew labels, imports, and navigation patterns.
 *
 * Run: npx tsx scripts/critic-ux-audit.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { readFileSync, existsSync } from 'fs'
import path from 'path'

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relativePath: string): string | null {
  const full = path.join(ROOT, relativePath)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf-8')
}

interface UxCheck {
  page: string
  file: string
  checks: { name: string; test: (src: string) => boolean; failMsg: string }[]
}

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

const UX_CHECKS: UxCheck[] = [
  // 1. Dashboard
  {
    page: 'Dashboard',
    file: 'src/app/dashboard/page.tsx',
    checks: [
      {
        name: 'Dashboard: CTA \u05DE\u05E6\u05D2\u05EA',
        test: src => /מצגת/.test(src),
        failMsg: 'Missing "מצגת" (presentation CTA)'
      },
      {
        name: 'Dashboard: CTA \u05D4\u05E6\u05E2\u05EA \u05DE\u05D7\u05D9\u05E8',
        test: src => /הצעת מחיר/.test(src),
        failMsg: 'Missing "הצעת מחיר" (price quote CTA)'
      },
      {
        name: 'Dashboard: Link /create-proposal',
        test: src => /\/create-proposal|create-proposal/.test(src),
        failMsg: 'Missing Link to /create-proposal'
      },
      {
        name: 'Dashboard: Link /price-quote',
        test: src => /\/price-quote|price-quote/.test(src),
        failMsg: 'Missing Link to /price-quote'
      }
    ]
  },

  // 2. Generate page
  {
    page: 'Generate',
    file: 'src/app/generate/[id]/page.tsx',
    checks: [
      {
        name: 'Generate: progress bar',
        test: src => /width\s*:|style.*width/i.test(src),
        failMsg: 'Missing progress bar (width style)'
      },
      {
        name: 'Generate: Hebrew stage labels',
        test: src => /[\u0590-\u05FF]{3,}/.test(src),
        failMsg: 'Missing Hebrew stage labels'
      },
      {
        name: 'Generate: timer/elapsed',
        test: src => /elapsed|timer|Timer|שניות|דקות/i.test(src),
        failMsg: 'Missing timer or elapsed time indicator'
      },
      {
        name: 'Generate: error + retry',
        test: src => /error|Error/.test(src) && /retry|נסה/i.test(src),
        failMsg: 'Missing error state with retry'
      },
      {
        name: 'Generate: \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1 text',
        test: src => /נסה שוב/.test(src),
        failMsg: 'Missing "נסה שוב" (retry text)'
      },
      {
        name: 'Generate: FlowStepper import',
        test: src => /FlowStepper/i.test(src),
        failMsg: 'Missing FlowStepper import'
      },
      {
        name: 'Generate: TIPS array',
        test: src => /TIPS/i.test(src),
        failMsg: 'Missing TIPS array'
      },
      {
        name: 'Generate: PRESENTATION_TEMPLATES',
        test: src => /PRESENTATION_TEMPLATES/i.test(src),
        failMsg: 'Missing PRESENTATION_TEMPLATES selector'
      }
    ]
  },

  // 3. Edit page
  {
    page: 'Edit',
    file: 'src/app/edit/[id]/page.tsx',
    checks: [
      {
        name: 'Edit: HtmlSlideEditor import',
        test: src => /HtmlSlideEditor/.test(src),
        failMsg: 'Missing HtmlSlideEditor import'
      },
      {
        name: 'Edit: ShareDialog import',
        test: src => /ShareDialog/.test(src),
        failMsg: 'Missing ShareDialog import'
      },
      {
        name: 'Edit: PDF download button',
        test: src => /pdf|PDF|download/i.test(src),
        failMsg: 'Missing PDF download button'
      },
      {
        name: 'Edit: regenerate \u05E2\u05E6\u05D1 \u05DE\u05D7\u05D3\u05E9',
        test: src => /עצב מחדש/.test(src),
        failMsg: 'Missing "עצב מחדש" (regenerate button)'
      },
      {
        name: 'Edit: slide navigation',
        test: src => /setActiveHtmlSlide|activeHtmlSlide/.test(src),
        failMsg: 'Missing slide navigation (setActiveHtmlSlide)'
      },
      {
        name: 'Edit: slide counter',
        test: src => /שקף.*מתוך|מתוך/.test(src),
        failMsg: 'Missing slide counter ("שקף...מתוך")'
      },
      {
        name: 'Edit: \u05D7\u05D6\u05E8\u05D4 back link',
        test: src => /חזרה/.test(src),
        failMsg: 'Missing "חזרה" (back link)'
      }
    ]
  },

  // 4. Price quote
  {
    page: 'Price Quote',
    file: 'src/app/price-quote/page.tsx',
    checks: [
      {
        name: 'Price Quote: form inputs',
        test: src => /input|Input|<form|useForm/i.test(src),
        failMsg: 'Missing form inputs'
      },
      {
        name: 'Price Quote: PDF download',
        test: src => /pdf|PDF/i.test(src),
        failMsg: 'Missing PDF download feature'
      },
      {
        name: 'Price Quote: \u05D4\u05D5\u05E8\u05D3 text',
        test: src => /הורד/.test(src),
        failMsg: 'Missing "הורד" (download text)'
      },
      {
        name: 'Price Quote: preview section',
        test: src => /preview|Preview|תצוגה/i.test(src),
        failMsg: 'Missing preview section'
      }
    ]
  },

  // 5. Share page
  {
    page: 'Share',
    file: 'src/app/s/[token]/page.tsx',
    checks: [
      {
        name: 'Share: _htmlPresentation check',
        test: src => /_htmlPresentation/.test(src),
        failMsg: 'Missing _htmlPresentation check'
      },
      {
        name: 'Share: notFound()',
        test: src => /notFound\(\)/.test(src),
        failMsg: 'Missing notFound() for missing data'
      },
      {
        name: 'Share: view_count increment',
        test: src => /view_count|views/i.test(src),
        failMsg: 'Missing view_count increment'
      },
      {
        name: 'Share: no auth gate',
        test: src => {
          // Should NOT have getUser check before rendering content
          // Check that getUser is absent or that content renders regardless
          const hasGetUser = /getUser/.test(src)
          const hasRedirectOnNoUser = /getUser[\s\S]*redirect|!user[\s\S]*redirect/i.test(src)
          return !hasRedirectOnNoUser
        },
        failMsg: 'Share page should render without auth requirement'
      }
    ]
  },

  // 6. Wizard
  {
    page: 'Wizard',
    file: 'src/components/wizard/proposal-wizard.tsx',
    checks: [
      {
        name: 'Wizard: \u05E6\u05D5\u05E8 \u05D4\u05E6\u05E2\u05D4 button',
        test: src => /צור הצעה/.test(src),
        failMsg: 'Missing "צור הצעה" (generate button)'
      },
      {
        name: 'Wizard: confidence/warnings',
        test: src => /confidence|warning|Warning|אזהר/i.test(src),
        failMsg: 'Missing confidence indicator or warnings'
      },
      {
        name: 'Wizard: step navigation',
        test: src => /step|Step|שלב/i.test(src),
        failMsg: 'Missing step navigation'
      }
    ]
  }
]

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function runUxAudit(): CriticResult {
  const details: CriticResult['details'] = []
  let totalChecks = 0
  let passedCount = 0

  for (const page of UX_CHECKS) {
    const src = readFile(page.file)

    if (!src) {
      details.push({
        name: `${page.page}: file exists`,
        status: 'fail',
        message: `File not found: ${page.file}`
      })
      // Count all checks in this page as failed
      for (const chk of page.checks) {
        details.push({ name: chk.name, status: 'fail', message: 'Skipped — file not found' })
        totalChecks++
      }
      totalChecks++ // for the file-exists check itself
      continue
    }

    details.push({ name: `${page.page}: file exists`, status: 'pass' })
    totalChecks++
    passedCount++

    for (const chk of page.checks) {
      totalChecks++
      if (chk.test(src)) {
        details.push({ name: chk.name, status: 'pass' })
        passedCount++
      } else {
        details.push({ name: chk.name, status: 'fail', message: chk.failMsg })
      }
    }
  }

  const failedCount = details.filter(d => d.status === 'fail').length
  const warningCount = details.filter(d => d.status === 'warn').length
  const score = totalChecks > 0 ? Math.round((passedCount / totalChecks) * 100) : 0

  return {
    module: 'ux-audit',
    score,
    passed: passedCount,
    failed: failedCount,
    warnings: warningCount,
    details
  }
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

function main() {
  console.log('\n=== Critic Module 5: UX Flow Audit ===\n')

  const result = runUxAudit()

  console.log(`Score: ${result.score}/100`)
  console.log(`Passed: ${result.passed}  Failed: ${result.failed}  Warnings: ${result.warnings}\n`)

  // Group by page
  let currentPage = ''
  for (const d of result.details) {
    const pageName = d.name.split(':')[0]
    if (pageName !== currentPage) {
      currentPage = pageName
      console.log(`\n  --- ${currentPage} ---`)
    }
    const icon = d.status === 'pass' ? '  \u2705' : d.status === 'fail' ? '  \u274C' : '  \u26A0\uFE0F '
    console.log(`${icon} ${d.name}${d.message ? ` — ${d.message}` : ''}`)
  }

  console.log('')
  process.exit(result.failed > 0 ? 1 : 0)
}

const isMain = require.main === module || process.argv[1]?.endsWith('critic-ux-audit.ts')
if (isMain && !process.env.__CRITIC_IMPORTED) {
  main()
}
export async function run() { return runUxAudit() }
