/**
 * QA: wizard-fidelity contract (spec C4) — pure, no network/env needed.
 *
 * Usage (from repo root):
 *   npx tsx scripts/test-wizard-contract.mts
 */
import assert from 'node:assert/strict'

import {
  buildWizardContract,
  checkWizardCoverage,
  type ContractItem,
} from '../src/lib/gemini/wizard-contract'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

function ids(items: ContractItem[]): string[] {
  return items.map(i => i.id)
}

// ─── Fixture: full wizardData (step-keyed shape) ──────────────────────────

const fullWizardData: Record<string, unknown> = {
  brief: {
    brandName: 'KUNI',
    brandBrief: 'מותג גרנולה פרימיום',
    brandPainPoints: ['מודעות נמוכה'],
    brandObjective: 'חדירה לשוק הצעיר',
  },
  goals: {
    goals: [
      { title: 'הגדלת מודעות', description: 'חשיפה לקהל צעיר' },
      { title: 'הנעה לרכישה', description: 'המרות באתר' },
    ],
    customGoals: ['בניית קהילה'],
    targets: [{ metric: 'מכירות', value: '20%', timeline: 'עד סוף השנה' }],
  },
  target_audience: {
    targetGender: 'נשים',
    targetAgeRange: '25-34',
    targetDescription: 'נשים צעירות אורבניות שמחפשות איזון בין קריירה לבריאות',
    targetBehavior: 'קונות אונליין',
    targetInsights: ['קונות אונליין', 'עוקבות אחרי משפיעניות'],
  },
  key_insight: {
    keyInsight: 'הקהל לא מחפש עוד מוצר — הוא מחפש טקס יומי',
    insightSource: 'Nielsen 2024',
    insightData: '73% מהצרכנים סומכים על המלצות',
  },
  strategy: {
    strategyHeadline: 'מהפכת הטקס היומי',
    strategyPillars: [
      { title: 'אותנטיות', description: 'תוכן אמיתי' },
      { title: 'קהילה', description: 'שיח דו-כיווני' },
      { title: 'טרנד', description: 'רכיבה על גל' },
    ],
  },
  creative: {
    activityTitle: 'הבוקר שלי עם KUNI',
    activityConcept: 'משפיעניות מתעדות את הרוטינה',
    activityDescription: 'תיעוד רוטינת בוקר',
    activityApproach: [],
    keyMessages: ['טבעי באמת', 'טעים בכל בוקר'],
    toneOfManner: 'חם, אישי, לא מתנשא',
    visualDirection: 'אור בוקר רך, טונים חמים',
    referenceImages: [],
  },
  deliverables: {
    deliverables: [
      { type: 'רילס', quantity: 24, description: 'רוטינת בוקר', purpose: 'מודעות' },
      { type: 'סטורי', quantity: 48, description: 'יום-יום', purpose: 'תדירות' },
    ],
    referenceImages: [],
  },
  quantities: {
    influencerCount: 6,
    contentTypes: [{ type: 'רילס', quantityPerInfluencer: 4, totalQuantity: 24 }],
    campaignDurationMonths: 3,
    totalDeliverables: 72,
  },
  media_targets: {
    budget: 90000,
    currency: 'ILS',
    potentialReach: 1500000,
    potentialEngagement: 45000,
    cpe: 2,
    cpm: 60,
    estimatedImpressions: 3000000,
  },
  influencers: {
    influencers: [
      { name: 'נועה כהן', username: 'noa', followers: 250000, engagementRate: 3.5 },
      { name: 'דנה לוי', username: 'dana', followers: 180000, engagementRate: 4.1 },
    ],
  },
}

const EXPECTED_IDS = [
  'brief.brandName',
  'goals.goals', 'goals.customGoals', 'goals.targets',
  'target_audience.targetDescription', 'target_audience.targetInsights',
  'key_insight.keyInsight', 'key_insight.insightSource', 'key_insight.insightData',
  'strategy.strategyHeadline', 'strategy.strategyPillars',
  'creative.activityTitle', 'creative.activityConcept', 'creative.keyMessages',
  'creative.toneOfManner', 'creative.visualDirection',
  'deliverables.deliverables',
  'quantities.influencerCount', 'quantities.contentTypes',
  'media_targets.budget', 'media_targets.potentialReach', 'media_targets.cpe',
  'media_targets.cpm', 'media_targets.estimatedImpressions',
  'influencers.influencers',
]

const contract = buildWizardContract(fullWizardData)

// ─── Contract shape ────────────────────────────────────────────────────────

check('full wizardData → all expected contract items', () => {
  assert.equal(contract.items.length, EXPECTED_IDS.length, ids(contract.items).join(','))
  assert.deepEqual(ids(contract.items).sort(), [...EXPECTED_IDS].sort())
})

check('verbatim flags: keyInsight + pillar titles + names are quotes', () => {
  const byId = new Map(contract.items.map(i => [i.id, i]))
  assert.equal(byId.get('key_insight.keyInsight')!.verbatim, true)
  assert.equal(byId.get('strategy.strategyPillars')!.verbatim, true)
  assert.deepEqual(byId.get('strategy.strategyPillars')!.value, ['אותנטיות', 'קהילה', 'טרנד'])
  assert.equal(byId.get('influencers.influencers')!.verbatim, true)
  assert.equal(byId.get('goals.goals')!.verbatim, false)
})

check('tone/visual are style directives: mustAppearIn empty + folded into promptBlock', () => {
  const tone = contract.items.find(i => i.id === 'creative.toneOfManner')!
  const visual = contract.items.find(i => i.id === 'creative.visualDirection')!
  assert.deepEqual(tone.mustAppearIn, [])
  assert.deepEqual(visual.mustAppearIn, [])
  assert.ok(contract.promptBlock.includes('הנחיות סגנון'))
  assert.ok(contract.promptBlock.includes('חם, אישי, לא מתנשא'))
  assert.ok(contract.promptBlock.includes('אור בוקר רך, טונים חמים'))
})

check('promptBlock is a Hebrew MANDATORY block with exact values', () => {
  assert.ok(contract.promptBlock.includes('נאמנות לוויזארד'))
  assert.ok(contract.promptBlock.includes('אסור להחליף עובדות/מבנה/מספרים'))
  assert.ok(contract.promptBlock.includes('הקהל לא מחפש עוד מוצר — הוא מחפש טקס יומי'))
  assert.ok(contract.promptBlock.includes('₪90,000'))
  assert.ok(contract.promptBlock.includes('1,500,000'))
  assert.ok(contract.promptBlock.includes('ציטוט'))
})

check('empty wizardData → empty contract', () => {
  const empty = buildWizardContract({})
  assert.equal(empty.items.length, 0)
  assert.equal(empty.promptBlock, '')
  const res = checkWizardCoverage([], empty)
  assert.equal(res.covered.length + res.missing.length, 0)
  assert.ok(res.report.length > 0)
})

check('_wizardState.stepData shape resolves too', () => {
  const nested = buildWizardContract({ _wizardState: { stepData: { brief: { brandName: 'KUNI' } } } })
  assert.deepEqual(ids(nested.items), ['brief.brandName'])
})

check('flat proposal-data shape resolves (brandName/keyInsight/budget)', () => {
  const flat = buildWizardContract({ brandName: 'KUNI', keyInsight: 'תובנה חדה', budget: 90000, currency: 'ILS' })
  assert.deepEqual(ids(flat.items).sort(), ['brief.brandName', 'key_insight.keyInsight', 'media_targets.budget'])
})

// ─── Fixture: full deck that honors the contract ──────────────────────────

const fullDeck = [
  { slideType: 'cover', slots: { brandName: 'KUNI', title: 'הצעת מחיר לקמפיין משפיענים' } },
  {
    slideType: 'goals',
    slots: {
      title: 'המטרות: עלייה של 20% במכירות עד סוף השנה',
      pillars: [
        { number: '01', title: 'הגדלת מודעות', description: 'וחשיפה לקהל הצעיר' },
        { number: '02', title: 'הנעה לרכישה', description: 'המרות באתר' },
        { number: '03', title: 'בניית קהילה', description: 'סביב המותג' },
      ],
    },
  },
  {
    slideType: 'audience',
    slots: {
      title: 'הפרסונה',
      bodyText: 'נשים צעירות אורבניות שמחפשות איזון בין קריירה לבריאות',
      bullets: ['קונות אונליין', 'עוקבות אחרי משפיעניות'],
    },
  },
  {
    slideType: 'insight',
    slots: {
      title: 'הקהל לא מחפש עוד מוצר — הוא מחפש טקס יומי',
      dataPoint: '73%',
      dataLabel: 'מהצרכנים סומכים על המלצות',
      source: 'Nielsen 2024',
    },
  },
  {
    slideType: 'strategy',
    slots: {
      title: 'מהפכת הטקס היומי',
      pillars: [
        { number: '01', title: 'אותנטיות', description: 'תוכן אמיתי' },
        { number: '02', title: 'קהילה', description: 'שיח דו-כיווני' },
        { number: '03', title: 'טרנד', description: 'רכיבה על גל' },
      ],
    },
  },
  {
    slideType: 'bigIdea',
    slots: {
      title: 'הבוקר שלי עם KUNI',
      body: 'משפיעניות מתעדות את הרוטינה שלהן — טבעי באמת, טעים בכל בוקר',
    },
  },
  {
    slideType: 'deliverables',
    slots: {
      title: 'מה נפיק',
      pillars: [
        { number: '24', title: 'רילסים', description: '6 משפיעניות × 4 רילסים' },
        { number: '48', title: 'סטוריז', description: 'תיעוד יומיומי' },
      ],
    },
  },
  {
    slideType: 'influencers',
    slots: {
      title: 'הטאלנטים',
      subtitle: '6 משפיעניות מובילות',
      influencers: [
        { name: 'נועה כהן', handle: '@noa', followers: '250K', engagement: '3.5%' },
        { name: 'דנה לוי', handle: '@dana', followers: '180K', engagement: '4.1%' },
      ],
    },
  },
  {
    slideType: 'metrics',
    slots: {
      title: 'יעדי מדיה',
      stats: [
        { value: '₪90K', label: 'תקציב' },
        { value: '1.5M', label: 'חשיפה פוטנציאלית' },
        { value: '₪2', label: 'יעד CPE' },
        { value: '60', label: 'יעד CPM' },
        { value: '3M', label: 'אימפרשנים' },
      ],
    },
  },
  { slideType: 'closing', slots: { brandName: 'KUNI', title: 'בואו נתחיל' } },
]

check('full deck → zero missing (incl. ₪90K / 1.5M / 3M numeric forms)', () => {
  const res = checkWizardCoverage(fullDeck, contract)
  assert.deepEqual(ids(res.missing), [], res.report)
  assert.equal(res.covered.length, contract.items.length)
  assert.ok(res.report.includes('✓'))
  assert.ok(!res.report.includes('✗'))
})

// ─── Missing detection ─────────────────────────────────────────────────────

check('sparse/wrong deck → targeted misses', () => {
  const sparseDeck = [
    { slideType: 'cover', slots: { brandName: 'KUNI', title: 'הצעה' } },
    // wrong insight (different claim)
    { slideType: 'insight', slots: { title: 'שוק המשפיענים צומח', dataPoint: '12%', source: 'דו"ח פנימי' } },
    // wrong budget + wrong reach
    { slideType: 'metrics', slots: { stats: [{ value: '₪80K', label: 'תקציב' }, { value: '1.2M', label: 'חשיפה' }] } },
    // no goals / audience / strategy / bigIdea / deliverables / influencers slides
  ]
  const res = checkWizardCoverage(sparseDeck, contract)
  const missingIds = ids(res.missing)
  assert.ok(missingIds.includes('key_insight.keyInsight'), res.report)
  assert.ok(missingIds.includes('media_targets.budget'), res.report)
  assert.ok(missingIds.includes('media_targets.potentialReach'), res.report)
  assert.ok(missingIds.includes('goals.goals'), res.report) // no goals slide at all
  const coveredIds = ids(res.covered)
  assert.ok(coveredIds.includes('brief.brandName'))
  assert.ok(coveredIds.includes('creative.toneOfManner')) // style items auto-covered
  assert.ok(res.report.includes('✗'))
  assert.ok(res.report.includes('אין שקף מסוג'))
})

check('numeric mismatch: budget 90K vs 80K is MISSING, 90K form is covered', () => {
  const budgetContract = buildWizardContract({ media_targets: { budget: 90000, currency: 'ILS' } })
  assert.deepEqual(ids(budgetContract.items), ['media_targets.budget'])

  const wrong = checkWizardCoverage(
    [{ slideType: 'stats', slots: { stats: [{ value: '₪80K', label: 'תקציב' }] } }],
    budgetContract,
  )
  assert.deepEqual(ids(wrong.missing), ['media_targets.budget'], wrong.report)

  // 'stats' slideType aliases to the metrics slot; ₪90K == 90000
  const right = checkWizardCoverage(
    [{ slideType: 'stats', slots: { stats: [{ value: '₪90K', label: 'תקציב' }] } }],
    budgetContract,
  )
  assert.deepEqual(ids(right.missing), [], right.report)
})

// ─── Hebrew prefix matching ────────────────────────────────────────────────

check('Hebrew prefixes ו/ה/ב/ל/מ/ש are stripped for matching', () => {
  const c = buildWizardContract({
    target_audience: {
      targetDescription: 'קניות אונליין',
      targetInsights: ['מחקר שוק'],
    },
  })
  const res = checkWizardCoverage(
    [{ slideType: 'audience', slots: { bodyText: 'הקניות באונליין', bullets: ['שיווק דיגיטלי'] } }],
    c,
  )
  // 'הקניות'→'קניות', 'באונליין'→'אונליין' → covered
  assert.ok(ids(res.covered).includes('target_audience.targetDescription'), res.report)
  // 'מחקר שוק' has no real overlap with 'שיווק דיגיטלי'
  assert.ok(ids(res.missing).includes('target_audience.targetInsights'), res.report)
})

// ─── Verbatim threshold ────────────────────────────────────────────────────

check('verbatim needs ≥70% tokens: paraphrase fails, exact quote passes', () => {
  const c = buildWizardContract({ key_insight: { keyInsight: 'הקהל מחפש טקס יומי קבוע' } })

  const paraphrased = checkWizardCoverage(
    [{ slideType: 'insight', slots: { title: 'הקהל רוצה חוויה יומית' } }],
    c,
  )
  assert.deepEqual(ids(paraphrased.missing), ['key_insight.keyInsight'], paraphrased.report)

  const exact = checkWizardCoverage(
    [{ slideType: 'insight', slots: { title: 'הקהל מחפש טקס יומי קבוע' } }],
    c,
  )
  assert.deepEqual(ids(exact.missing), [], exact.report)
})

check('verbatim pillar titles: dropping one of three pillars → missing', () => {
  const c = buildWizardContract({
    strategy: {
      strategyPillars: [
        { title: 'אותנטיות', description: '' },
        { title: 'קהילה', description: '' },
        { title: 'טרנד', description: '' },
      ],
    },
  })
  const res = checkWizardCoverage(
    [{ slideType: 'strategy', slots: { pillars: [{ title: 'אותנטיות' }, { title: 'קהילה' }, { title: 'חדשנות' }] } }],
    c,
  )
  // 2/3 = 0.67 < 0.75 array threshold
  assert.ok(ids(res.missing).includes('strategy.strategyPillars'), res.report)
  assert.ok(res.report.includes('טרנד'))
})

console.log(`\n${passed} checks passed`)
