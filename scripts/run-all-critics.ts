/**
 * Critic Orchestrator — runs all critic modules and generates a Hebrew report.
 *
 * Run: npx tsx scripts/run-all-critics.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { execSync } from 'child_process'
import path from 'path'
import { existsSync } from 'fs'
import type { CriticResult } from './critic-types'

const ROOT = path.resolve(__dirname, '..')

// ═══════════════════════════════════════════════════════
//  Module registry
// ═══════════════════════════════════════════════════════

interface ModuleEntry {
  key: string
  label: string
  emoji: string
  weight: number
  file: string
  type: 'static' | 'module'
}

const MODULES: ModuleEntry[] = [
  { key: 'static',      label: 'בדיקות סטטיות',   emoji: '🔨', weight: 0.20, file: 'critic-agent.ts',        type: 'static' },
  { key: 'html',        label: 'איכות HTML',       emoji: '🎨', weight: 0.25, file: 'critic-html-quality.ts', type: 'module' },
  { key: 'prompts',     label: 'פרומפטים',         emoji: '📝', weight: 0.15, file: 'critic-prompts.ts',      type: 'module' },
  { key: 'ux',          label: 'UX',               emoji: '🖥️',  weight: 0.15, file: 'critic-ux-audit.ts',     type: 'module' },
  { key: 'data',        label: 'שלמות נתונים',     emoji: '🔗', weight: 0.15, file: 'critic-data.ts',         type: 'module' },
  { key: 'performance', label: 'ביצועים',          emoji: '⚡', weight: 0.10, file: 'critic-performance.ts',  type: 'module' },
]

// ═══════════════════════════════════════════════════════
//  Static critic runner (subprocess)
// ═══════════════════════════════════════════════════════

function runStaticCritic(scriptPath: string): CriticResult {
  try {
    const output = execSync(`npx tsx ${scriptPath} 2>&1`, {
      encoding: 'utf-8',
      cwd: ROOT,
      timeout: 120_000,
    })

    // Parse passed/failed from output
    const passedMatch = output.match(/Passed:\s*(\d+)/)
    const failedMatch = output.match(/Failed:\s*(\d+)/)
    const warningsMatch = output.match(/Warnings:\s*(\d+)/)

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
    const warn = warningsMatch ? parseInt(warningsMatch[1], 10) : 0

    const total = passed + failed
    const score = total > 0 ? Math.round((passed / total) * 100) : 0

    // Parse individual check lines
    const details: CriticResult['details'] = []
    const lines = output.split('\n')
    for (const line of lines) {
      // Only match indented check lines, skip summary lines (Passed/Failed/Warnings/Total)
      if (!/^\s{2,}[✅❌⚠️]/.test(line)) continue
      if (/\b(Passed|Failed|Warnings|Total):/i.test(line)) continue
      const passLine = line.match(/✅\s+(.+)/)
      const failLine = line.match(/❌\s+(.+)/)
      const warnLine = line.match(/⚠️\s+(.+)/)
      if (passLine) details.push({ name: passLine[1].trim(), status: 'pass' })
      if (failLine) details.push({ name: failLine[1].trim(), status: 'fail' })
      if (warnLine) details.push({ name: warnLine[1].trim(), status: 'warn' })
    }

    return { module: 'Static Checks', score, passed, failed, warnings: warn, details }
  } catch (err: any) {
    // Process exited with code 1 (failures found) but still has output
    const output = err.stdout || err.stderr || ''
    const passedMatch = output.match(/Passed:\s*(\d+)/)
    const failedMatch = output.match(/Failed:\s*(\d+)/)
    const warningsMatch = output.match(/Warnings:\s*(\d+)/)

    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0
    const warn = warningsMatch ? parseInt(warningsMatch[1], 10) : 0
    const total = passed + failed
    const score = total > 0 ? Math.round((passed / total) * 100) : 0

    const details: CriticResult['details'] = []
    const lines = output.split('\n')
    for (const line of lines) {
      // Only match indented check lines, skip summary lines (Passed/Failed/Warnings/Total)
      if (!/^\s{2,}[✅❌⚠️]/.test(line)) continue
      if (/\b(Passed|Failed|Warnings|Total):/i.test(line)) continue
      const passLine = line.match(/✅\s+(.+)/)
      const failLine = line.match(/❌\s+(.+)/)
      const warnLine = line.match(/⚠️\s+(.+)/)
      if (passLine) details.push({ name: passLine[1].trim(), status: 'pass' })
      if (failLine) details.push({ name: failLine[1].trim(), status: 'fail' })
      if (warnLine) details.push({ name: warnLine[1].trim(), status: 'warn' })
    }

    return { module: 'Static Checks', score, passed, failed, warnings: warn, details }
  }
}

// ═══════════════════════════════════════════════════════
//  Module runner (dynamic import)
// ═══════════════════════════════════════════════════════

async function runModuleCritic(scriptPath: string): Promise<CriticResult | null> {
  const mod = await import(scriptPath)
  if (typeof mod.run !== 'function') {
    // Module exists but doesn't export run() — treat as not-yet-implemented
    return null
  }
  return mod.run()
}

// ═══════════════════════════════════════════════════════
//  Report generator
// ═══════════════════════════════════════════════════════

function formatReport(
  results: Map<string, CriticResult | null>,
  overallScore: number,
  totalPassed: number,
  totalFailed: number,
  totalWarnings: number
) {
  const sep = '═'.repeat(50)
  const date = new Date().toISOString().split('T')[0]

  const lines: string[] = []
  lines.push('')
  lines.push(sep)
  lines.push('  ביקורת מוצר — דו"ח מפורט')
  lines.push(`  תאריך: ${date}`)
  lines.push(sep)
  lines.push('')
  lines.push(`📊 ציון כללי: ${overallScore}/100`)
  lines.push('')

  for (const entry of MODULES) {
    const result = results.get(entry.key)
    if (!result) {
      lines.push(`${entry.emoji} ${entry.label}: — (לא זמין)`)
      lines.push('')
      continue
    }

    lines.push(`${entry.emoji} ${entry.label}: ${result.score}/100`)

    // Show failures and warnings
    const failures = result.details.filter(d => d.status === 'fail')
    const warns = result.details.filter(d => d.status === 'warn')

    if (failures.length > 0) {
      for (const f of failures) {
        lines.push(`  ❌ ${f.name}${f.message ? `: ${f.message}` : ''}`)
      }
    }
    if (warns.length > 0) {
      for (const w of warns) {
        lines.push(`  ⚠️  ${w.name}${w.message ? `: ${w.message}` : ''}`)
      }
    }
    if (failures.length === 0 && warns.length === 0) {
      lines.push(`  ✅ כל הבדיקות עברו`)
    }
    lines.push('')
  }

  lines.push(sep)
  lines.push(`  סיכום: ${totalPassed} בדיקות עברו | ${totalFailed} נכשלו | ${totalWarnings} אזהרות`)
  lines.push(sep)
  lines.push('')

  return lines.join('\n')
}

// ═══════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════

async function main() {
  const results = new Map<string, CriticResult | null>()
  let activeWeightSum = 0

  for (const entry of MODULES) {
    const scriptPath = path.join(ROOT, 'scripts', entry.file)

    if (!existsSync(scriptPath)) {
      console.log(`⚠️  Skipping ${entry.label} — ${entry.file} not found`)
      results.set(entry.key, null)
      continue
    }

    try {
      console.log(`▶ Running ${entry.label}...`)
      let modResult: CriticResult | null = null

      if (entry.type === 'static') {
        modResult = runStaticCritic(scriptPath)
      } else {
        modResult = await runModuleCritic(scriptPath)
      }

      if (!modResult) {
        console.log(`  ⚠️  ${entry.label} — no run() export, skipping`)
        results.set(entry.key, null)
        continue
      }

      results.set(entry.key, modResult)
      activeWeightSum += entry.weight
      console.log(`  → ${modResult.score}/100 (${modResult.passed}✅ ${modResult.failed}❌ ${modResult.warnings}⚠️)`)
    } catch (err) {
      console.error(`  ✗ ${entry.label} crashed: ${err instanceof Error ? err.message : String(err)}`)
      results.set(entry.key, {
        module: entry.label,
        score: 0,
        passed: 0,
        failed: 1,
        warnings: 0,
        details: [{ name: 'Module execution', status: 'fail', message: String(err) }],
      })
      activeWeightSum += entry.weight
    }
  }

  // Calculate weighted overall score
  let weightedSum = 0
  for (const entry of MODULES) {
    const result = results.get(entry.key)
    if (result) {
      // Normalize weight relative to active modules
      const normalizedWeight = activeWeightSum > 0 ? entry.weight / activeWeightSum : 0
      weightedSum += result.score * normalizedWeight
    }
  }
  const overallScore = Math.round(weightedSum)

  // Totals
  let totalPassed = 0
  let totalFailed = 0
  let totalWarnings = 0
  for (const [, result] of Array.from(results.entries())) {
    if (result) {
      totalPassed += result.passed
      totalFailed += result.failed
      totalWarnings += result.warnings
    }
  }

  // Print report
  const report = formatReport(results, overallScore, totalPassed, totalFailed, totalWarnings)
  console.log(report)

  // Exit with code 1 if overall weighted score < 70
  if (overallScore < 70) {
    console.log(`🔴 ציון כללי ${overallScore}/100 < 70 — נדרש תיקון!\n`)
    process.exit(1)
  } else {
    console.log(`🟢 ציון כללי ${overallScore}/100 — תקין.\n`)
    process.exit(0)
  }
}

main().catch((err) => {
  console.error('Fatal orchestrator error:', err)
  process.exit(1)
})
