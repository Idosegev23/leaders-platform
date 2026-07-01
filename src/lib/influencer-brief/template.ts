import type { InfluencerBriefInput, DeckStepData, DeckInfluencer } from './types'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtNum(n?: number): string {
  if (!n || n <= 0) return '—'
  return n.toLocaleString('he-IL')
}

function section(title: string, bodyHtml: string): string {
  if (!bodyHtml.trim()) return ''
  return `
    <section class="sec">
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    </section>`
}

function list(items: (string | undefined)[]): string {
  const clean = items.filter((x): x is string => !!x && x.trim().length > 0)
  if (!clean.length) return ''
  return `<ul>${clean.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`
}

function influencerCard(inf: DeckInfluencer): string {
  const meta = [
    inf.username ? esc(inf.username) : '',
    (inf.categories && inf.categories.length) ? esc(inf.categories.join(' · ')) : '',
    inf.followers ? `${fmtNum(inf.followers)} עוקבים` : '',
    inf.engagementRate ? `ER ${inf.engagementRate}%` : '',
  ].filter(Boolean).join(' • ')
  return `
    <div class="inf">
      <div class="inf-name">${esc(inf.name || 'משפיען')}</div>
      ${meta ? `<div class="inf-meta">${meta}</div>` : ''}
      ${inf.bio ? `<div class="inf-bio">${esc(inf.bio)}</div>` : ''}
    </div>`
}

export function renderInfluencerBriefHtml(input: InfluencerBriefInput): string {
  const sd: DeckStepData = input.data._stepData || {}
  const creative = sd.creative || {}
  const strategy = sd.strategy || {}
  const deliverables = sd.deliverables?.deliverables || []
  const influencers = sd.influencers?.influencers || []
  const insight = sd.key_insight?.keyInsight
  const objective = sd.brief?.brandObjective

  const keyMessages = [
    strategy.strategyHeadline,
    ...(strategy.strategyPillars || []).map(p => `${p.title} — ${p.description}`),
  ]

  const deliverablesHtml = deliverables.length
    ? `<table class="deliv"><thead><tr><th>סוג תוצר</th><th>כמות</th><th>מטרה</th></tr></thead><tbody>${
        deliverables.map(d => `<tr>
          <td>${esc(d.type)}</td>
          <td class="num">${d.quantity ? esc(d.quantity) : '—'}</td>
          <td>${esc(d.purpose || d.description || '')}</td>
        </tr>`).join('')
      }</tbody></table>${
        sd.deliverables?.deliverablesSummary
          ? `<p class="note">${esc(sd.deliverables.deliverablesSummary)}</p>` : ''
      }`
    : ''

  const influencersHtml = influencers.length
    ? influencers.map(influencerCard).join('')
    : '<p class="note">לא הוגדרו משפיענים בשלב זה.</p>'

  const generatedOn = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Heebo', 'Arial', sans-serif;
    color: #212529; background: #ffffff;
    width: 794px; padding: 56px 60px 72px;
    line-height: 1.6; direction: rtl;
  }
  .head { border-bottom: 3px solid #f2cc0d; padding-bottom: 20px; margin-bottom: 28px; }
  .kicker { font-size: 13px; letter-spacing: 2px; color: #6b7281; font-weight: 700; text-transform: uppercase; }
  h1 { font-size: 32px; font-weight: 800; margin-top: 6px; }
  .sub { color: #6b7281; font-size: 15px; margin-top: 6px; }
  .sec { margin-bottom: 26px; page-break-inside: avoid; }
  .sec h2 {
    font-size: 19px; font-weight: 800; color: #212529;
    padding-inline-start: 12px; border-inline-start: 4px solid #f2cc0d;
    margin-bottom: 12px;
  }
  .sec p { font-size: 15px; color: #343a40; }
  ul { list-style: none; padding: 0; }
  li { font-size: 15px; color: #343a40; padding-inline-start: 20px; position: relative; margin-bottom: 6px; }
  li::before { content: '●'; color: #f2cc0d; position: absolute; inset-inline-start: 0; font-size: 10px; top: 6px; }
  .insight { background: #fcf9e6; border: 1px solid #f2cc0d; border-radius: 12px; padding: 18px 22px; font-size: 16px; font-weight: 600; }
  table.deliv { width: 100%; border-collapse: collapse; font-size: 14px; }
  table.deliv th { background: #212529; color: #fff; text-align: right; padding: 9px 12px; font-weight: 700; }
  table.deliv td { border-bottom: 1px solid #e9ecef; padding: 9px 12px; vertical-align: top; }
  table.deliv td.num { text-align: center; font-weight: 700; }
  .note { color: #6b7281; font-size: 13px; margin-top: 8px; font-style: italic; }
  .inf { border: 1px solid #e9ecef; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; page-break-inside: avoid; }
  .inf-name { font-weight: 800; font-size: 16px; }
  .inf-meta { color: #6b7281; font-size: 13px; margin-top: 2px; }
  .inf-bio { font-size: 14px; color: #343a40; margin-top: 6px; }
  .foot { margin-top: 40px; border-top: 1px solid #e9ecef; padding-top: 14px; color: #adb5bd; font-size: 12px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="head">
    <div class="kicker">בריף למשפיענים · Leaders</div>
    <h1>${esc(input.brandName)}</h1>
    ${creative.activityTitle ? `<div class="sub">${esc(creative.activityTitle)}</div>` : ''}
    ${input.brandTagline ? `<div class="sub">${esc(input.brandTagline)}</div>` : ''}
  </div>

  ${section('מטרת הקמפיין', objective ? `<p>${esc(objective)}</p>` : '')}
  ${section('התובנה המרכזית', insight ? `<div class="insight">${esc(insight)}</div>` : '')}
  ${section('הקונספט הקריאייטיבי', [
    creative.activityConcept ? `<p>${esc(creative.activityConcept)}</p>` : '',
    creative.activityDescription ? `<p style="margin-top:8px">${esc(creative.activityDescription)}</p>` : '',
    list((creative.activityApproach || []).map(a => `${a.title} — ${a.description}`)),
    creative.activityDifferentiator ? `<p class="note">Talk value: ${esc(creative.activityDifferentiator)}</p>` : '',
  ].join(''))}
  ${section('מסרי מפתח', list(keyMessages))}
  ${section('התוצרים הנדרשים', deliverablesHtml)}
  ${section('נבחרת המשפיענים', influencersHtml)}
  ${sd.influencers?.influencerCriteria?.length
      ? section('קריטריונים לליהוק', list(sd.influencers.influencerCriteria)) : ''}

  <div class="foot">
    <span>Leaders · מסמך פנימי</span>
    <span>נוצר ${esc(generatedOn)}</span>
  </div>
</body>
</html>`
}
