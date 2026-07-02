/**
 * Shape test for the deck-blueprint generator + mandate (Gemini host is blocked
 * from the dev sandbox, so the model call is injected).
 * Run: npx tsx scripts/test-deck-blueprint.mts
 */
import assert from 'node:assert'
import { generateDeckBlueprint, blueprintToMandate, __setBlueprintCallerForTests } from '@/lib/gemini/deck-blueprint'

let passed = 0
const ok = (c: boolean, m: string) => { assert.ok(c, m); console.log('  ✔', m); passed++ }

// 1. Happy path — canned valid JSON (note: intentionally messy slideType casing/spaces).
__setBlueprintCallerForTests(async () => JSON.stringify({
  theCrack: 'סולתם מוכרת שליטה, לא סירים',
  keyInsight: '73% מהקונים בוחרים לפי אמון',
  strategy: { headline: 'מסורת פוגשת חדשנות', pillars: [{ title: 'אמון', description: 'תוכן אותנטי' }, { title: 'מודעות', description: 'הגעה רחבה' }] },
  audienceFocus: 'מבשלים ביתיים 30+',
  slidePlan: [
    { slideType: 'Cover', title: 'הצעד הראשון', purpose: 'פתיחה', whatItShows: 'מוצר', focus: 'כותרת' },
    { slideType: 'pillar 1', title: 'אמון', purpose: 'עמוד תווך', whatItShows: 'תוכן', focus: 'אמון' },
    { slideType: 'closing', title: 'בואו נתחיל', purpose: 'סגירה', whatItShows: 'CTA', focus: 'קריאה' },
  ],
}))
const bp = await generateDeckBlueprint({ brandName: 'סולתם', briefText: 'בריף' })
ok(bp.theCrack.includes('שליטה'), 'theCrack parsed')
ok(bp.slidePlan.length === 3, 'slidePlan has 3 slides')
ok(bp.slidePlan[0].slideType === 'cover', 'slideType normalized (Cover → cover)')
ok(bp.slidePlan[1].slideType === 'pillar-1', 'slideType kebab-normalized (pillar 1 → pillar-1)')
ok(bp.strategy.pillars.length === 2, 'pillars parsed')
ok(bp.approved === false, 'starts unapproved')

// 2. Mandate contains the plan, in order.
const mandate = blueprintToMandate(bp)
ok(mandate.includes('<approved_blueprint>'), 'mandate is tagged')
ok(mandate.includes('הצעד הראשון') && mandate.includes('בואו נתחיל'), 'mandate lists slides')
ok(mandate.indexOf('שקף 1') < mandate.indexOf('שקף 3'), 'mandate preserves order')
ok(mandate.includes('3 שקפים'), 'mandate states slide count')

// 3. Malformed JSON (the array-open corruption) still recovers via parseGeminiJson.
__setBlueprintCallerForTests(async () => `{
"theCrack":"פ",
"keyInsight":"ק",
"strategy":{"headline":"h","pillars":[]},
"audienceFocus":"a",
"slidePlan":.",
{"slideType":"cover","title":"t","purpose":"p","whatItShows":"w","focus":"f"}
]
}`)
const bp2 = await generateDeckBlueprint({ brandName: 'x' })
ok(bp2.slidePlan.length === 1, 'malformed array-open JSON recovered (1 slide)')

// 4. Empty plan throws.
__setBlueprintCallerForTests(async () => JSON.stringify({ theCrack: '', slidePlan: [] }))
let threw = false
try { await generateDeckBlueprint({ brandName: 'x' }) } catch { threw = true }
ok(threw, 'empty slidePlan throws')

__setBlueprintCallerForTests(null)
console.log(`\nALL ${passed} CHECKS PASSED`)
