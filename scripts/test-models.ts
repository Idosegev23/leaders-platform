/**
 * Model Comparison Test Script
 *
 * Parses a DOCX brief and runs extractFromBrief through each AI model,
 * saving results side-by-side for comparison.
 *
 * Usage: npx tsx scripts/test-models.ts "/path/to/brief.docx"
 */

import * as fs from 'fs'
import * as path from 'path'
import * as mammoth from 'mammoth'

// Load env before anything else
import { config } from 'dotenv'
config({ path: path.join(__dirname, '..', '.env.local') })

import { callAI, type AICallResult } from '../src/lib/ai-provider'
import { parseGeminiJson } from '../src/lib/utils/json-cleanup'

// ─── Models to test ───────────────────────────────────────────────

const MODELS_TO_TEST = [
  { id: 'gpt-5.2-pro-2025-12-11', label: 'GPT-5.2 Pro', needsKey: 'OPENAI_API_KEY' },
  { id: 'gpt-5.2-2025-12-11', label: 'GPT-5.2', needsKey: 'OPENAI_API_KEY' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', needsKey: 'GEMINI_API_KEY' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', needsKey: 'GEMINI_API_KEY' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', needsKey: 'ANTHROPIC_API_KEY' },
]

// ─── Brief extraction prompt (same as proposal-agent.ts) ──────────

function buildExtractionPrompt(briefText: string): string {
  return `חלץ מידע עסקי בסיסי מהמסמכים הבאים. אל תייצר אסטרטגיה או קריאייטיב — רק חלץ עובדות.
נאמנות לבריף: כל מטרה, מדד הצלחה, דרישה ספציפית ואזכור מתחרים שהלקוח הזכיר חייבים להופיע — ציטוט מדויק מהבריף.

## בריף לקוח:
${briefText}

(לא סופק מסמך התנעה)

החזר JSON עם המבנה הבא בלבד:
{
  "brand": { "name": "שם המותג", "officialName": null, "industry": "תעשייה", "subIndustry": null, "website": null, "tagline": null, "background": "תיאור קצר מה שרשום בבריף" },
  "budget": { "amount": 0, "currency": "₪", "breakdown": null },
  "campaignGoals": ["מטרה 1 כפי שנכתבה בבריף"],
  "targetAudience": {
    "primary": { "gender": "נשים/גברים/שניהם", "ageRange": "XX-XX", "interests": ["תחום"], "painPoints": ["כאב"], "lifestyle": "כפי שנכתב בבריף", "socioeconomic": null },
    "secondary": null,
    "behavior": "כפי שנכתב בבריף"
  },
  "keyInsight": null,
  "insightSource": null,
  "deliverables": [{ "type": "סוג", "quantity": null, "description": "כפי שנכתב" }],
  "influencerPreferences": { "types": [], "specificNames": [], "criteria": [], "verticals": [] },
  "timeline": { "startDate": null, "endDate": null, "duration": null, "milestones": [] },
  "additionalNotes": [],
  "successMetrics": ["מדד הצלחה 1 — ציטוט מדויק מהבריף", "KPI שהלקוח ציין"],
  "clientSpecificRequests": ["דרישה ספציפית שהלקוח ביקש", "הגבלה או דגש מיוחד"],
  "competitorMentions": ["מתחרה שהוזכר בבריף"],
  "_meta": { "confidence": "high", "warnings": [], "hasKickoff": false }
}`
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const docxPath = process.argv[2]
  if (!docxPath) {
    console.error('Usage: npx tsx scripts/test-models.ts "/path/to/brief.docx"')
    process.exit(1)
  }

  // 1. Parse DOCX
  console.log('\n📄 Parsing DOCX...')
  const buffer = fs.readFileSync(docxPath)
  const { value: briefText } = await mammoth.extractRawText({ buffer })
  console.log(`   Brief: ${briefText.length} chars`)
  console.log(`   Preview: ${briefText.slice(0, 200)}...\n`)

  const prompt = buildExtractionPrompt(briefText)
  const outputDir = path.join(__dirname, '..', 'test-results')
  fs.mkdirSync(outputDir, { recursive: true })

  // Save brief text
  fs.writeFileSync(path.join(outputDir, 'brief-text.txt'), briefText, 'utf-8')

  // 2. Run each model
  const results: Array<{
    model: string
    label: string
    provider: string
    durationMs: number
    success: boolean
    error?: string
    brandName?: string
    goalsCount?: number
    output?: unknown
  }> = []

  for (const modelDef of MODELS_TO_TEST) {
    const envKey = modelDef.needsKey
    if (!process.env[envKey]) {
      console.log(`⏭️  Skipping ${modelDef.label} — ${envKey} not set`)
      results.push({
        model: modelDef.id,
        label: modelDef.label,
        provider: 'skipped',
        durationMs: 0,
        success: false,
        error: `${envKey} not set`,
      })
      continue
    }

    console.log(`\n${'═'.repeat(60)}`)
    console.log(`🧪 Testing: ${modelDef.label} (${modelDef.id})`)
    console.log('═'.repeat(60))

    const start = Date.now()
    try {
      const aiResult: AICallResult = await callAI({
        model: modelDef.id,
        prompt,
        systemPrompt: 'אתה מחלץ מידע עסקי ממסמכים. החזר JSON בלבד.',
        thinkingLevel: 'LOW',
        maxOutputTokens: 32000,
        callerId: `test-${modelDef.id}`,
      })

      const durationMs = Date.now() - start
      const parsed = parseGeminiJson<any>(aiResult.text || '{}')

      // Save raw output
      const safeName = modelDef.id.replace(/[^a-zA-Z0-9.-]/g, '_')
      fs.writeFileSync(
        path.join(outputDir, `${safeName}-raw.json`),
        JSON.stringify(parsed, null, 2),
        'utf-8'
      )

      console.log(`\n✅ ${modelDef.label} — ${(durationMs / 1000).toFixed(1)}s`)
      console.log(`   Provider: ${aiResult.provider}, Model: ${aiResult.model}`)
      console.log(`   Brand: ${parsed?.brand?.name || 'N/A'}`)
      console.log(`   Goals: ${parsed?.campaignGoals?.length || 0}`)
      console.log(`   Deliverables: ${parsed?.deliverables?.length || 0}`)
      console.log(`   Metrics: ${parsed?.successMetrics?.length || 0}`)

      results.push({
        model: modelDef.id,
        label: modelDef.label,
        provider: aiResult.provider,
        durationMs,
        success: true,
        brandName: parsed?.brand?.name,
        goalsCount: parsed?.campaignGoals?.length || 0,
        output: parsed,
      })
    } catch (err) {
      const durationMs = Date.now() - start
      const errMsg = err instanceof Error ? err.message : String(err)
      console.log(`\n❌ ${modelDef.label} — FAILED (${(durationMs / 1000).toFixed(1)}s)`)
      console.log(`   Error: ${errMsg.slice(0, 200)}`)

      results.push({
        model: modelDef.id,
        label: modelDef.label,
        provider: 'error',
        durationMs,
        success: false,
        error: errMsg.slice(0, 500),
      })
    }
  }

  // 3. Summary
  console.log(`\n\n${'═'.repeat(60)}`)
  console.log('📊 COMPARISON SUMMARY')
  console.log('═'.repeat(60))
  console.log('')

  const header = 'Model'.padEnd(25) + 'Time'.padEnd(10) + 'Brand'.padEnd(20) + 'Goals'.padEnd(8) + 'Status'
  console.log(header)
  console.log('─'.repeat(70))

  for (const r of results) {
    const time = r.success ? `${(r.durationMs / 1000).toFixed(1)}s` : '—'
    const brand = r.brandName || '—'
    const goals = r.success ? String(r.goalsCount) : '—'
    const status = r.success ? '✅' : `❌ ${r.error?.slice(0, 30) || ''}`
    console.log(
      r.label.padEnd(25) +
      time.padEnd(10) +
      brand.padEnd(20) +
      goals.padEnd(8) +
      status
    )
  }

  // Save summary
  fs.writeFileSync(
    path.join(outputDir, 'summary.json'),
    JSON.stringify(results.map(({ output, ...rest }) => rest), null, 2),
    'utf-8'
  )

  console.log(`\n📁 Results saved to: ${outputDir}/`)
  console.log('   - brief-text.txt')
  console.log('   - summary.json')
  for (const r of results) {
    if (r.success) {
      const safeName = r.model.replace(/[^a-zA-Z0-9.-]/g, '_')
      console.log(`   - ${safeName}-raw.json`)
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
