/**
 * Critic Module 7: Performance & Cost
 *
 * Loads document ef988080-... from Supabase and checks audit log / pipeline performance.
 * Run standalone: npx tsx scripts/critic-performance.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import type { CriticResult } from './critic-types'

const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Missing SUPABASE env vars')
  return createClient(url, key)
}

export async function run(): Promise<CriticResult> {
  const supabase = makeClient()

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', DOC_ID)
    .single()

  if (error || !doc) {
    return {
      module: 'Performance & Cost',
      score: 0,
      passed: 0,
      failed: 1,
      warnings: 0,
      details: [{ name: 'Load document', status: 'fail', message: error?.message || 'Document not found' }],
    }
  }

  const data = doc.data || {}
  const details: CriticResult['details'] = []
  let passed = 0
  let failed = 0
  let warnings = 0

  function check(name: string, ok: boolean, msg?: string) {
    if (ok) {
      details.push({ name, status: 'pass' })
      passed++
    } else {
      details.push({ name, status: 'fail', message: msg })
      failed++
    }
  }

  function warnCheck(name: string, ok: boolean, msg?: string) {
    if (ok) {
      details.push({ name, status: 'pass' })
      passed++
    } else {
      details.push({ name, status: 'warn', message: msg })
      warnings++
    }
  }

  const auditLog: any[] | undefined = data._auditLog
  const hasAudit = Array.isArray(auditLog) && auditLog.length > 0

  if (hasAudit) {
    // 1. Total generation duration < 120s (pass), < 180s (warn), else fail
    const timestamps = auditLog
      .map((e: any) => e.timestamp || e.ts || e.created_at)
      .filter(Boolean)
      .map((t: string) => new Date(t).getTime())
      .sort((a: number, b: number) => a - b)

    if (timestamps.length >= 2) {
      const totalDuration = (timestamps[timestamps.length - 1] - timestamps[0]) / 1000
      if (totalDuration < 120) {
        details.push({ name: `Total duration ${totalDuration.toFixed(0)}s < 120s`, status: 'pass' })
        passed++
      } else if (totalDuration < 180) {
        details.push({ name: `Total duration ${totalDuration.toFixed(0)}s < 180s`, status: 'warn', message: 'Slower than ideal' })
        warnings++
      } else {
        details.push({ name: `Total duration ${totalDuration.toFixed(0)}s > 180s`, status: 'fail', message: 'Too slow' })
        failed++
      }
    } else {
      warnCheck('Total duration calculable', false, 'Not enough timestamps')
    }

    // 2. No single AI call > 90s
    const durations = auditLog
      .map((e: any) => e.duration || e.durationMs || e.duration_ms)
      .filter((d: any) => typeof d === 'number')
    const maxCall = durations.length > 0 ? Math.max(...durations) : 0
    const maxCallSec = maxCall > 1000 ? maxCall / 1000 : maxCall // normalize to seconds if in ms
    if (durations.length === 0) {
      warnCheck('No single AI call > 90s', false, 'No duration data in audit log')
    } else {
      check(
        `Longest AI call ${maxCallSec.toFixed(1)}s < 90s`,
        maxCallSec < 90,
        `Longest call was ${maxCallSec.toFixed(1)}s`
      )
    }

    // 3. Fallback rate < 30%
    const fallbackEntries = auditLog.filter((e: any) => e.fallback || e.isFallback || e.type === 'fallback')
    const fallbackRate = auditLog.length > 0 ? fallbackEntries.length / auditLog.length : 0
    check(
      `Fallback rate ${(fallbackRate * 100).toFixed(0)}% < 30%`,
      fallbackRate < 0.3,
      `${fallbackEntries.length}/${auditLog.length} calls used fallback`
    )

    // 4. Error count < 3
    const errorEntries = auditLog.filter((e: any) => e.error || e.status === 'error' || e.level === 'error')
    check(
      `Error count ${errorEntries.length} < 3`,
      errorEntries.length < 3,
      `${errorEntries.length} errors found`
    )

    // 5. Design system uses Gemini model
    const designEntries = auditLog.filter((e: any) =>
      (e.step || e.stage || e.phase || '').toLowerCase().includes('design') ||
      (e.agent || '').toLowerCase().includes('design')
    )
    const designUsesGemini = designEntries.some((e: any) =>
      (e.model || '').toLowerCase().includes('gemini')
    )
    if (designEntries.length === 0) {
      warnCheck('Design system uses Gemini', false, 'No design system entries in audit log')
    } else {
      check('Design system uses Gemini model', designUsesGemini, 'Design system not using Gemini')
    }

    // 6. Planner uses GPT-5.4
    const plannerEntries = auditLog.filter((e: any) =>
      (e.step || e.stage || e.phase || '').toLowerCase().includes('plan') ||
      (e.agent || '').toLowerCase().includes('proposal') ||
      (e.agent || '').toLowerCase().includes('planner')
    )
    const plannerUsesGpt = plannerEntries.some((e: any) =>
      (e.model || '').toLowerCase().includes('gpt')
    )
    if (plannerEntries.length === 0) {
      warnCheck('Planner uses GPT-5.4', false, 'No planner entries in audit log')
    } else {
      check('Planner uses GPT-5.4', plannerUsesGpt, 'Planner not using GPT model')
    }
  } else {
    // No audit log — give 50/100 with warning
    details.push({ name: 'Audit log found', status: 'warn', message: 'No audit log found — scoring at 50/100' })
    warnings++
  }

  // Pipeline checks (always run)
  const pipeline = data._pipeline

  // 7. Pipeline status
  check(
    '_pipeline.status is complete or has foundation',
    !!pipeline && (pipeline.status === 'complete' || !!pipeline.foundation),
    pipeline ? `status: ${pipeline.status}, foundation: ${!!pipeline.foundation}` : '_pipeline missing'
  )

  // 8. Foundation has designSystem with colors
  const ds = pipeline?.foundation?.designSystem
  check(
    'Foundation designSystem has colors',
    !!ds && (!!ds.colors || !!ds.palette || !!ds.primaryColor),
    'designSystem missing or has no colors'
  )

  // 9. Foundation has plan with > 5 slides
  const plan = pipeline?.foundation?.plan || pipeline?.foundation?.slidePlan
  const slideCount = Array.isArray(plan) ? plan.length : (plan?.slides?.length || 0)
  check(
    `Foundation plan has > 5 slides (found ${slideCount})`,
    slideCount > 5,
    `Only ${slideCount} slides in plan`
  )

  // Score calculation
  if (!hasAudit) {
    // No audit log: 50/100 base, adjusted by pipeline checks
    const pipelineChecks = details.filter(d => d.status === 'pass').length
    const pipelineTotal = details.filter(d => d.status !== 'warn').length
    const pipelineScore = pipelineTotal > 0 ? Math.round((pipelineChecks / pipelineTotal) * 50) : 0
    return {
      module: 'Performance & Cost',
      score: 50 + pipelineScore,
      passed,
      failed,
      warnings,
      details,
    }
  }

  const totalChecks = passed + failed
  const score = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0

  return {
    module: 'Performance & Cost',
    score,
    passed,
    failed,
    warnings,
    details,
  }
}

// Standalone execution
if (require.main === module) {
  run().then((result) => {
    console.log(`\n⚡ Performance & Cost — ${result.score}/100`)
    for (const d of result.details) {
      const icon = d.status === 'pass' ? '✅' : d.status === 'fail' ? '❌' : '⚠️'
      console.log(`  ${icon} ${d.name}${d.message ? `: ${d.message}` : ''}`)
    }
    console.log(`\n  Passed: ${result.passed} | Failed: ${result.failed} | Warnings: ${result.warnings}`)
    process.exit(result.failed > 0 ? 1 : 0)
  }).catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
