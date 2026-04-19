/**
 * Critic Module 6: Data Integrity
 *
 * Loads document ef988080-... from Supabase and checks data consistency.
 * Run standalone: npx tsx scripts/critic-data.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import type { CriticResult } from './critic-types'

const DOC_ID = 'ef988080-bfbd-42cc-b94e-a0b0ad0b0c69'
const POINTS_PER_CHECK = 8

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
      module: 'Data Integrity',
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

  // 1. brandName exists and not empty
  check(
    'brandName exists',
    typeof data.brandName === 'string' && data.brandName.trim().length > 0,
    'brandName is missing or empty'
  )

  // 2. _brandColors exists with primary/secondary/accent
  const bc = data._brandColors
  check(
    '_brandColors has primary/secondary/accent',
    bc && typeof bc.primary === 'string' && typeof bc.secondary === 'string' && typeof bc.accent === 'string',
    '_brandColors missing or incomplete'
  )

  // 3. _brandColors.primary is not default — OR _isFallback flag set
  const isDefaultColor = bc?.primary === '#E94560' || bc?.primary === '#111111'
  check(
    '_brandColors.primary is not default (or fallback flagged)',
    !isDefaultColor || !!data._isFallback || !!bc?._isFallback,
    `primary is default ${bc?.primary} without _isFallback flag`
  )

  // 4. _brandResearch exists
  check(
    '_brandResearch exists',
    !!data._brandResearch && typeof data._brandResearch === 'object',
    '_brandResearch missing'
  )

  // 5. _brandResearch.industry is not "לא ידוע" — OR _isFallback
  const br = data._brandResearch
  check(
    '_brandResearch.industry is known (or fallback flagged)',
    !br || br.industry !== 'לא ידוע' || !!data._isFallback || !!br?._isFallback,
    `industry is "לא ידוע" without _isFallback flag`
  )

  // 6. _influencerStrategy exists
  check(
    '_influencerStrategy exists',
    !!data._influencerStrategy && typeof data._influencerStrategy === 'object',
    '_influencerStrategy missing'
  )

  // 7. _influencerStrategy.recommendations is array with length > 0 — OR _isFallback
  const is = data._influencerStrategy
  check(
    '_influencerStrategy.recommendations has entries (or fallback)',
    (Array.isArray(is?.recommendations) && is.recommendations.length > 0) || !!data._isFallback || !!is?._isFallback,
    'recommendations empty without _isFallback'
  )

  // 8. _htmlPresentation exists
  const hp = data._htmlPresentation
  check(
    '_htmlPresentation exists',
    !!hp && typeof hp === 'object',
    '_htmlPresentation missing'
  )

  // 9. htmlSlides length matches slideTypes length
  if (hp) {
    check(
      'htmlSlides length matches slideTypes length',
      Array.isArray(hp.htmlSlides) && Array.isArray(hp.slideTypes) && hp.htmlSlides.length === hp.slideTypes.length,
      `htmlSlides(${hp.htmlSlides?.length}) vs slideTypes(${hp.slideTypes?.length})`
    )
  } else {
    check('htmlSlides length matches slideTypes length', false, 'no _htmlPresentation')
  }

  // 10. htmlSlides length >= 10
  check(
    'htmlSlides >= 10 slides',
    Array.isArray(hp?.htmlSlides) && hp.htmlSlides.length >= 10,
    `only ${hp?.htmlSlides?.length || 0} slides`
  )

  // 11. _pipeline.foundation exists
  check(
    '_pipeline.foundation exists',
    !!data._pipeline && !!data._pipeline.foundation,
    '_pipeline or foundation missing'
  )

  // 12. Budget is null when not specified (not 0)
  check(
    'budget is null (not 0) when unspecified',
    data.budget !== 0,
    'budget is 0 instead of null'
  )

  // 13. _versions array exists with at least 1 entry — warn only
  warnCheck(
    '_versions array has entries',
    Array.isArray(data._versions) && data._versions.length > 0,
    '_versions missing or empty'
  )

  // 14. _auditLog exists with entries — warn only
  warnCheck(
    '_auditLog has entries',
    Array.isArray(data._auditLog) && data._auditLog.length > 0,
    '_auditLog missing or empty'
  )

  const totalChecks = passed + failed
  const score = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0

  return {
    module: 'Data Integrity',
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
    console.log(`\n🔗 Data Integrity — ${result.score}/100`)
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
