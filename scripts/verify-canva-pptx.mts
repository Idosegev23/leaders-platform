/**
 * QA: native PPTX export verification (Canva import pipeline).
 *
 * Usage (from repo root):
 *   npx tsx scripts/verify-canva-pptx.mts              # fixture (all 8 layouts) + real KUNI deck → XML validation
 *   RUN_E2E=1 npx tsx scripts/verify-canva-pptx.mts    # + upload to Supabase Storage + REAL Canva url-import
 *
 * Outputs .pptx files + extracted XML into $OUT_DIR (default: ./.pptx-verify, git-ignored path ok).
 */
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

// ── Load .env.local before importing app modules ──
const envPath = path.join(process.cwd(), '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1')
}

const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), '.pptx-verify')
fs.mkdirSync(OUT_DIR, { recursive: true })

const { structuredPresentationToPptxDetailed } = await import('../src/lib/export/structured-pptx')
type StructuredPresentation = import('../src/lib/gemini/layout-prototypes/types').StructuredPresentation

const KUNI_DOC_ID = '88f5cab6-53d7-423e-b092-a3146e6ae3fc'

// ── Fixture: every layout + freeElements + elementStyles + hidden + bg override + broken image ──
const IMG = (seed: string, w = 1600, h = 900) => `https://picsum.photos/seed/${seed}/${w}/${h}`

const fixture: StructuredPresentation = {
  brandName: 'מותג בדיקה',
  brandLogoUrl: IMG('logo', 300, 100),
  designSystem: {
    colors: {
      primary: '#E94560', secondary: '#0F3460', accent: '#F5A623',
      background: '#0F0F1A', text: '#FFFFFF', muted: '#8888AA', cardBg: '#1A1A2E',
    },
    fonts: { heading: 'Heebo', body: 'Heebo' },
  },
  slides: [
    { slideType: 'cover', layout: 'hero-cover', slots: {
      brandName: 'מותג בדיקה', title: 'קמפיין משפיענים 2026', subtitle: 'אסטרטגיה, קריאייטיב ותוצאות', eyebrowLabel: 'INITIATION', backgroundImage: IMG('cover', 1920, 1080),
    } },
    { slideType: 'context', layout: 'full-bleed-image-text', slots: {
      image: IMG('bleed', 1920, 1080), eyebrowLabel: 'CONTEXT // 01', title: 'הקהל השתנה', subtitle: 'הצרכן הישראלי חי בפיד', body: 'שלושה מתוך ארבעה צרכנים מגלים מותגים חדשים דרך יוצרי תוכן, לא דרך פרסום ממומן.',
    } },
    { slideType: 'brief', layout: 'split-image-text', slots: {
      image: IMG('split', 1200, 1400), imageSide: 'left', eyebrowLabel: 'THE BRIEF', title: 'מה המשימה שלנו', bodyText: 'להפוך את המותג לשם המדובר בקטגוריה.', bullets: ['חיזוק מודעות בקרב קהל 25-40', 'יצירת תוכן אותנטי', 'הנעה למכירה בנקודות המגע'],
    } },
    { slideType: 'insight', layout: 'centered-insight', slots: {
      eyebrowLabel: 'INSIGHT', title: 'אנשים לא קונים ממותגים. הם קונים מאנשים.', dataPoint: '73%', dataLabel: 'מהקונים מחליטים לפי המלצת חבר', source: 'Nielsen, 2025',
    } },
    { slideType: 'strategy', layout: 'three-pillars-grid', slots: {
      eyebrowLabel: 'STRATEGY', title: 'שלושה עמודי תווך', sideImage: IMG('pillar', 900, 1400), pillars: [
        { number: '01', title: 'מודעות', description: 'חשיפה רחבה דרך מובילי דעה גדולים' },
        { number: '02', title: 'אמון', description: 'תוכן אותנטי מיוצרים בינוניים' },
        { number: '03', title: 'המרה', description: 'קודי הנחה ושיתופי פעולה ממוקדים' },
      ],
    } },
    { slideType: 'metrics', layout: 'numbered-stats', slots: {
      eyebrowLabel: 'FORECAST', title: 'המספרים שנביא', backgroundImage: IMG('stats', 1920, 1080), stats: [
        { value: '1.5M', label: 'חשיפות אורגניות' },
        { value: '4.2%', label: 'מעורבות ממוצעת' },
        { value: '₪120K', label: 'שווי מדיה', accent: false },
        { value: '18', label: 'יוצרי תוכן' },
      ],
    } },
    { slideType: 'influencers', layout: 'influencer-grid', slots: {
      eyebrowLabel: 'THE TALENT', title: 'היוצרים שלנו', subtitle: 'נבחרת פתיחה מוצעת', influencers: [
        { name: 'נועה כהן', handle: 'noa.cohen', followers: '250K', engagement: '3.5%', profilePicUrl: IMG('inf1', 400, 400), isVerified: true },
        { name: 'יובל לוי', handle: 'yuval.levi', followers: '180K', engagement: '4.1%', profilePicUrl: 'https://example.invalid/broken.jpg' },
        { name: 'שיר אזולאי', handle: 'shir.az', followers: '95K', engagement: '6.2%' },
      ],
    } },
    { slideType: 'influencers-empty', layout: 'influencer-grid', slots: {
      eyebrowLabel: 'THE TALENT', title: 'רשימת יוצרים', influencers: [],
    } },
    { slideType: 'closing', layout: 'closing-cta',
      slots: { brandName: 'מותג בדיקה', title: 'בואו נתחיל', tagline: 'Leaders × מותג בדיקה', backgroundImage: IMG('closing', 1920, 1080) },
      elementStyles: { title: 'left:160px; top:300px; width:1600px; font-size:140px;' },
      hiddenRoles: ['decor-corner-tl'],
      bg: { color: '#111122' },
      freeElements: [
        { id: 'free-1', kind: 'text', text: 'טקסט חופשי שנוסף בעורך', style: 'position:absolute; left:660px; top:860px; width:600px; height:80px;', format: { fontSize: 28, color: '#F5A623', textAlign: 'center' } },
        { id: 'free-2', kind: 'shape', shape: 'circle', fill: 'rgba(233,69,96,0.35)', style: 'position:absolute; left:100px; top:100px; width:160px; height:160px;' },
        { id: 'free-3', kind: 'image', src: IMG('free', 600, 400), style: 'position:absolute; left:1500px; top:800px; width:320px; height:200px;' },
      ],
    },
  ],
}

// ── Validation helpers ──
function validatePptx(file: string, expectedSlides: number, mustContain: string[]): void {
  const dir = file.replace(/\.pptx$/, '-extracted')
  fs.rmSync(dir, { recursive: true, force: true })
  execSync(`unzip -qq -o ${JSON.stringify(file)} -d ${JSON.stringify(dir)}`)
  const slidesDir = path.join(dir, 'ppt', 'slides')
  const slideFiles = fs.readdirSync(slidesDir).filter((f) => /^slide\d+\.xml$/.test(f))
  if (slideFiles.length !== expectedSlides) {
    throw new Error(`${path.basename(file)}: expected ${expectedSlides} slides, found ${slideFiles.length}`)
  }
  // XML well-formedness (xmllint ships with macOS)
  const xmlTargets = [
    path.join(dir, '[Content_Types].xml'),
    path.join(dir, 'ppt', 'presentation.xml'),
    ...slideFiles.map((f) => path.join(slidesDir, f)),
  ]
  for (const xml of xmlTargets) execSync(`xmllint --noout ${JSON.stringify(xml)}`)
  const allXml = slideFiles.map((f) => fs.readFileSync(path.join(slidesDir, f), 'utf8')).join('\n')
  for (const needle of mustContain) {
    if (!allXml.includes(needle)) throw new Error(`${path.basename(file)}: missing expected content "${needle}"`)
  }
  const mediaDir = path.join(dir, 'ppt', 'media')
  const mediaCount = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir).length : 0
  const rtlCount = (allXml.match(/rtl="1"/g) || []).length
  console.log(`  ✔ ${path.basename(file)}: ${slideFiles.length} slides, ${mediaCount} media files, ${rtlCount} rtl runs, XML valid`)
}

// ── 1. Fixture ──
console.log('— Fixture (all 8 layouts) —')
const fx = await structuredPresentationToPptxDetailed(fixture)
const fixtureFile = path.join(OUT_DIR, 'fixture.pptx')
fs.writeFileSync(fixtureFile, fx.buffer)
console.log(`  wrote ${fixtureFile} (${Math.round(fx.buffer.length / 1024)}KB), warnings: ${fx.warnings.length}`)
fx.warnings.forEach((w) => console.log(`    ⚠ ${w}`))
validatePptx(fixtureFile, fixture.slides.length, [
  'קמפיין משפיענים 2026', 'הקהל השתנה', 'מה המשימה שלנו', '73%', 'שלושה עמודי תווך',
  '1.5M', 'נועה כהן', 'בואו נתחיל', 'טקסט חופשי שנוסף בעורך',
])

// ── 2. Real KUNI deck from prod DB ──
console.log('— Real deck (KUNI) —')
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const { data: doc, error } = await sb.from('documents').select('id, title, data').eq('id', KUNI_DOC_ID).single()
if (error || !doc) throw new Error(`KUNI doc fetch failed: ${error?.message}`)
const structured = (doc.data as Record<string, unknown>)._structuredPresentation as StructuredPresentation
if (!structured?.slides?.length) throw new Error('KUNI has no _structuredPresentation')
fs.writeFileSync(path.join(OUT_DIR, 'kuni-structured.json'), JSON.stringify(structured, null, 2))
console.log(`  ${structured.slides.length} slides, layouts: ${[...new Set(structured.slides.map((s) => s.layout))].join(', ')}`)
const kuni = await structuredPresentationToPptxDetailed(structured)
const kuniFile = path.join(OUT_DIR, 'kuni.pptx')
fs.writeFileSync(kuniFile, kuni.buffer)
console.log(`  wrote ${kuniFile} (${Math.round(kuni.buffer.length / 1024)}KB), warnings: ${kuni.warnings.length}`)
kuni.warnings.forEach((w) => console.log(`    ⚠ ${w}`))
validatePptx(kuniFile, structured.slides.length, [])

// ── 3. Optional E2E: storage upload + REAL Canva url-import ──
if (process.env.RUN_E2E === '1') {
  console.log('— E2E: Supabase Storage upload + Canva url-import —')
  const { uploadAndSignedUrl, deckArtifactPath } = await import('../src/lib/render/storage')
  const { importDesignFromUrl, waitForUrlImport } = await import('../src/lib/canva/client')
  const { signedUrl, path: storagePath } = await uploadAndSignedUrl({
    path: deckArtifactPath(KUNI_DOC_ID, 'pptx'),
    body: kuni.buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  console.log(`  uploaded → ${storagePath}`)
  const { jobId } = await importDesignFromUrl({
    title: 'בדיקה — KUNI native PPTX',
    url: signedUrl,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
  console.log(`  Canva import job: ${jobId} — polling…`)
  const result = await waitForUrlImport(jobId)
  console.log(`  ✔ Canva design created: ${result.designId}`)
  console.log(`    edit: ${result.editUrl}`)
  console.log(`    view: ${result.viewUrl}`)
  // Design meta (page count) — proves Canva parsed every slide.
  const { getValidAccessToken } = await import('../src/lib/canva/oauth')
  const token = await getValidAccessToken()
  const metaRes = await fetch(`https://api.canva.com/rest/v1/designs/${result.designId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const meta = await metaRes.json()
  console.log(`  design meta: ${JSON.stringify(meta?.design ? { title: meta.design.title, page_count: meta.design.page_count } : meta)}`)
}

console.log('ALL CHECKS PASSED')
