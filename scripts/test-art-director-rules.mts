/**
 * QA: art-director rules module (spec C5) — pure, no network/env needed.
 *
 * Usage (from repo root):
 *   npx tsx scripts/test-art-director-rules.mts
 */
import assert from 'node:assert/strict'

import {
  ART_DIRECTOR_RULES,
  auditDesignSystem,
  slideRhythmHint,
  cssContrast,
} from '../src/lib/design/art-director-rules'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`ok - ${name}`)
}

// ─── Rulebook shape ───────────────────────────────────────────────────────

check('rulebook has 18–25 numbered rules + key constants', () => {
  const ruleCount = (ART_DIRECTOR_RULES.match(/^\d+\./gm) || []).length
  assert.ok(ruleCount >= 18 && ruleCount <= 25, `rule count ${ruleCount} out of range`)
  for (const token of ['4.5:1', '3:1', '80px', '24px', '60%', 'Frank Ruhl Libre', 'Heebo', 'RTL', 'eyebrow']) {
    assert.ok(ART_DIRECTOR_RULES.includes(token), `missing token: ${token}`)
  }
})

// ─── Fixture 1: good dark system → untouched ──────────────────────────────

const goodSystem = {
  colors: {
    primary: '#7DE2D1',
    secondary: '#33415C',
    accent: '#FFD166',
    background: '#0E0E12',
    text: '#F5F5F5',
    muted: '#9CA3AF',
    cardBg: '#1A1A22',
  },
  fonts: { heading: 'Frank Ruhl Libre', body: 'Heebo' },
}

check('good system passes clean', () => {
  const { issues, corrected } = auditDesignSystem(goodSystem)
  assert.equal(issues.length, 0, JSON.stringify(issues))
  assert.deepEqual(corrected, goodSystem)
})

// ─── Fixture 2: dark-on-dark primary → accent substitution ────────────────

check('dark-on-dark primary is swapped to accent', () => {
  const { issues, corrected } = auditDesignSystem({
    colors: {
      primary: '#1A1A1A',
      secondary: '#222222',
      accent: '#FFD166',
      background: '#111111',
      text: '#FFFFFF',
      muted: '#888888',
      cardBg: '#181818',
    },
  })
  assert.equal(issues.length, 1, JSON.stringify(issues))
  assert.equal(issues[0].field, 'colors.primary')
  assert.equal(corrected.colors.primary, '#FFD166')
  assert.equal(corrected.colors.text, '#FFFFFF') // untouched
})

// ─── Fixture 3: bad fonts → Heebo fallback; stacked allowed font normalizes ─

check('disallowed fonts fall back to Heebo, quoted allowed font normalizes silently', () => {
  const { issues, corrected } = auditDesignSystem({
    colors: { ...goodSystem.colors },
    fonts: { heading: 'Comic Sans MS', body: "'frank ruhl libre', serif" },
  })
  assert.equal(issues.length, 1, JSON.stringify(issues))
  assert.equal(issues[0].field, 'fonts.heading')
  assert.equal(corrected.fonts?.heading, 'Heebo')
  assert.equal(corrected.fonts?.body, 'Frank Ruhl Libre')
})

// ─── Fixture 4: light-on-light text + failing primary/accent chain ────────

check('light-on-light text corrected dark; primary chain skips failing accent', () => {
  const { issues, corrected } = auditDesignSystem({
    colors: {
      primary: '#E8E8E8', // fails 1.8 vs light bg
      secondary: '#0057B8', // first passing candidate
      accent: '#DDDDDD', // also fails → must be skipped
      background: '#F2F2F2',
      text: '#CFCFCF', // fails 4.5
      muted: '#666666',
      cardBg: '#FFFFFF',
    },
  })
  const fields = issues.map((i) => i.field).sort()
  assert.deepEqual(fields, ['colors.primary', 'colors.text'], JSON.stringify(issues))
  assert.equal(corrected.colors.text, '#111111')
  assert.equal(corrected.colors.primary, '#0057B8')
  const ratio = cssContrast(corrected.colors.text, corrected.colors.background)
  assert.ok(ratio !== null && ratio >= 4.5, `corrected text ratio ${ratio}`)
})

// ─── Fixture 5: unparseable color + rgb()/rgba() parsing ──────────────────

check('unparseable primary gets fallback; rgb/rgba values parse', () => {
  const { issues, corrected } = auditDesignSystem({
    colors: {
      primary: 'blurple',
      secondary: '#33415C',
      accent: '#FFD166',
      background: 'rgb(16, 16, 20)',
      text: 'rgba(255, 255, 255, 0.9)',
      muted: '#9CA3AF',
      cardBg: '#1A1A22',
    },
  })
  assert.equal(issues.length, 1, JSON.stringify(issues))
  assert.equal(issues[0].field, 'colors.primary')
  assert.equal(corrected.colors.primary, '#8AB4FF')
  assert.equal(corrected.colors.background, 'rgb(16, 16, 20)') // valid, untouched
})

// ─── cssContrast helper ───────────────────────────────────────────────────

check('cssContrast: white/black = 21, unparseable = null', () => {
  const wb = cssContrast('#FFFFFF', '#000000')
  assert.ok(wb !== null && Math.abs(wb - 21) < 0.01, `got ${wb}`)
  assert.equal(cssContrast('nope', '#000000'), null)
})

// ─── slideRhythmHint ──────────────────────────────────────────────────────

check('rhythm hints follow the narrative arc', () => {
  assert.match(slideRhythmHint(0, 15, 'cover'), /Cover.*image-dominant/i)
  assert.match(slideRhythmHint(14, 15, 'closing'), /mirror the cover/i)
  assert.match(slideRhythmHint(5, 15, 'insight'), /sparse \+ centered/i)
  assert.match(slideRhythmHint(9, 15, 'budget-stats'), /oversized numerals/i)
  assert.match(slideRhythmHint(4, 15, 'strategy'), /Image-dominant/) // even index
  assert.match(slideRhythmHint(5, 15, 'strategy'), /Text-dominant/) // odd index
  assert.notEqual(slideRhythmHint(2, 15, 'brief'), slideRhythmHint(12, 15, 'brief')) // phase differs
})

console.log(`\n${passed} checks passed`)
