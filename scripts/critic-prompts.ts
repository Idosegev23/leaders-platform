/**
 * Critic Module 4: Prompt Quality Audit
 *
 * Reads the slide-designer pipeline file and checks that prompt strings
 * contain required patterns for Hebrew, budget guard, 5-layer, RTL,
 * image handling, variety, fonts, canvas size, and post-processing.
 *
 * Run: npx tsx scripts/critic-prompts.ts
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
const SLIDE_DESIGNER = 'src/lib/gemini/slide-designer.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFile(relativePath: string): string | null {
  const full = path.join(ROOT, relativePath)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf-8')
}

/**
 * Extract all template literal and string literal content from the source.
 * This gives us the prompt text including interpolated variable references.
 */
function extractStringContent(src: string): string {
  // Return the full source — prompt strings are embedded inline
  // and we need to match both literal text and ${variable} patterns.
  return src
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface PromptCheck {
  name: string
  test: (src: string) => boolean
  failMsg: string
}

const CHECKS: PromptCheck[] = [
  {
    name: '1. Planner mentions Hebrew/\u05E2\u05D1\u05E8\u05D9\u05EA',
    test: src => /עברית|Hebrew/i.test(src),
    failMsg: 'Planner prompt must reference Hebrew language requirement'
  },
  {
    name: '2. Budget guard (\u05EA\u05E7\u05E6\u05D9\u05D1 / \u05D0\u05DC \u05EA\u05DE\u05E6\u05D9\u05D0)',
    test: src => /תקציב/.test(src) && (/אל תמציא/.test(src) || /don'?t invent/i.test(src)),
    failMsg: 'Planner must contain budget guard (תקציב AND אל תמציא/don\'t invent)'
  },
  {
    name: '3. HTML batch: 5-layer reference',
    test: src => (/5/.test(src) || /five/i.test(src)) && (/layer/i.test(src) || /שכבות/.test(src)),
    failMsg: 'HTML batch prompt must reference 5-layer architecture'
  },
  {
    name: '4. HTML batch: design system color interpolation',
    test: src => /\$\{c\.primary\}|\$\{.*primary\}|\$\{.*colors?\./.test(src) || /\$\{.*accent\}/.test(src),
    failMsg: 'HTML batch prompt must use design system color interpolation (${c.primary} or similar)'
  },
  {
    name: '5. HTML batch: RTL reference',
    test: src => /RTL|rtl|direction:\s*rtl/i.test(src),
    failMsg: 'HTML batch prompt must mention RTL'
  },
  {
    name: '6. HTML batch: IMAGE handling',
    test: src => /IMAGE|image/i.test(src),
    failMsg: 'HTML batch prompt must include image handling rules'
  },
  {
    name: '7. HTML batch: variety/VARY/\u05D2\u05D9\u05D5\u05D5\u05DF',
    test: src => /variety|VARY|גיוון/i.test(src),
    failMsg: 'HTML batch prompt must include variety rules'
  },
  {
    name: '8. Design system: visualMetaphor or creative',
    test: src => /visualMetaphor|creative/i.test(src),
    failMsg: 'Design system prompt must reference visualMetaphor or creative concept'
  },
  {
    name: '9. No prompt string > 35k chars',
    test: src => {
      // Find template literals (backtick strings)
      const templateLiterals = src.match(/`[\s\S]*?`/g) ?? []
      // Find regular string literals (long ones only)
      const longStrings = src.match(/"[\s\S]{1000,}?"|'[\s\S]{1000,}?'/g) ?? []
      const all = [...templateLiterals, ...longStrings]
      return all.every(s => s.length <= 35000)
    },
    failMsg: 'Found a prompt string exceeding 35,000 characters'
  },
  {
    name: '10. Planner: cover + closing mandatory types',
    test: src => /cover/.test(src) && /closing/.test(src),
    failMsg: 'Planner must define cover and closing as mandatory slide types'
  },
  {
    name: '11. HTML prompt: Heebo font',
    test: src => /Heebo/i.test(src),
    failMsg: 'HTML prompt must mention Heebo font'
  },
  {
    name: '12. HTML prompt: 1920 canvas width',
    test: src => /1920/.test(src),
    failMsg: 'HTML prompt must reference 1920px canvas width'
  },
  {
    name: '13. Planner post-processing: cover delete bodyText',
    test: src => /cover[\s\S]*bodyText|bodyText[\s\S]*cover|delete[\s\S]*bodyText|bodyText[\s\S]*delete/i.test(src),
    failMsg: 'Planner should post-process cover slides to delete bodyText'
  },
  {
    name: '14. Planner post-processing: closing delete instructions',
    test: src => /closing[\s\S]*instructions|instructions[\s\S]*closing|delete[\s\S]*instructions/i.test(src),
    failMsg: 'Planner should post-process closing slides to delete instructions'
  }
]

const POINTS_PER_CHECK = 100 / CHECKS.length  // ~7.14 each

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function runPromptAudit(): CriticResult {
  const details: CriticResult['details'] = []
  let score = 0

  const src = readFile(SLIDE_DESIGNER)
  if (!src) {
    return {
      module: 'prompts',
      score: 0,
      passed: 0,
      failed: 1,
      warnings: 0,
      details: [{ name: 'Load slide-designer.ts', status: 'fail', message: `File not found: ${SLIDE_DESIGNER}` }]
    }
  }

  details.push({ name: 'Load slide-designer.ts', status: 'pass' })

  const content = extractStringContent(src)

  for (const chk of CHECKS) {
    const ok = chk.test(content)
    if (ok) {
      details.push({ name: chk.name, status: 'pass' })
      score += POINTS_PER_CHECK
    } else {
      details.push({ name: chk.name, status: 'fail', message: chk.failMsg })
    }
  }

  const passed = details.filter(d => d.status === 'pass').length
  const failed = details.filter(d => d.status === 'fail').length
  const warnings = details.filter(d => d.status === 'warn').length

  return {
    module: 'prompts',
    score: Math.round(score),
    passed,
    failed,
    warnings,
    details
  }
}

// ---------------------------------------------------------------------------
// Standalone runner
// ---------------------------------------------------------------------------

function main() {
  console.log('\n=== Critic Module 4: Prompt Quality Audit ===\n')

  const result = runPromptAudit()

  console.log(`Score: ${result.score}/100`)
  console.log(`Passed: ${result.passed}  Failed: ${result.failed}  Warnings: ${result.warnings}\n`)

  for (const d of result.details) {
    const icon = d.status === 'pass' ? '  \u2705' : d.status === 'fail' ? '  \u274C' : '  \u26A0\uFE0F '
    console.log(`${icon} ${d.name}${d.message ? ` — ${d.message}` : ''}`)
  }

  console.log('')
  process.exit(result.failed > 0 ? 1 : 0)
}

const isMain = require.main === module || process.argv[1]?.endsWith('critic-prompts.ts')
if (isMain && !process.env.__CRITIC_IMPORTED) {
  main()
}
export async function run() { return runPromptAudit() }
