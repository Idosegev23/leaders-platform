/**
 * Structured Layout Renderer — produces HTML per slide from layout + slots.
 *
 * This is the "rich renderer" — owns the CSS arsenal (aurora, glassmorphism,
 * text shadows, watermarks, layered depth). Each layout archetype is a
 * standalone React component that takes typed slots + design system.
 *
 * Output: static HTML string per slide (renderToString), rendered at 1920×1080.
 */

import type {
  StructuredSlide,
  DesignSystem,
  HeroCoverSlots,
  FullBleedImageTextSlots,
  SplitImageTextSlots,
  CenteredInsightSlots,
  ThreePillarsGridSlots,
  NumberedStatsSlots,
  InfluencerGridSlots,
  ClosingCTASlots,
} from './types'

// ─── Shared style tokens ────────────────────────────────

function buildCommonCss(ds: DesignSystem): string {
  const { colors: c } = ds
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .slide {
      width: 1920px; height: 1080px;
      position: relative; overflow: hidden;
      font-family: 'Heebo', sans-serif; direction: rtl;
      background: ${c.background};
      color: ${c.text};
    }
    /* 5-layer atmospheric glows — always present */
    .atm-1 {
      position: absolute; inset: 0; z-index: 1; pointer-events: none;
      background:
        radial-gradient(ellipse 120% 80% at 15% 50%, ${c.primary}22, transparent 60%),
        radial-gradient(ellipse 80% 120% at 85% 30%, ${c.accent}18, transparent 55%);
    }
    /* Accent stripes (Layer 2) */
    .stripe-top { position: absolute; top: 0; left: 0; right: 0; height: 3px; z-index: 5;
      background: linear-gradient(90deg, ${c.primary}, ${c.accent}, transparent); }
    .stripe-bottom { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; z-index: 5;
      background: linear-gradient(270deg, ${c.primary}, ${c.accent}, transparent); }
    /* Corner accent (Layer 2) */
    .corner-tl { position: absolute; top: 40px; left: 40px; width: 60px; height: 60px; z-index: 5;
      border-top: 2px solid ${c.primary}; border-left: 2px solid ${c.primary}; }
    .corner-br { position: absolute; bottom: 40px; right: 40px; width: 60px; height: 60px; z-index: 5;
      border-bottom: 2px solid ${c.primary}; border-right: 2px solid ${c.primary}; }
    /* Eyebrow label (Layer 4) */
    .eyebrow {
      position: absolute; top: 60px; left: 80px; z-index: 6;
      font-size: 14px; font-weight: 300; letter-spacing: 8px;
      text-transform: uppercase; color: ${c.muted};
    }
    /* Slide number watermark (Layer 4) */
    .slide-num {
      position: absolute; bottom: 50px; right: 80px; z-index: 6;
      font-size: 14px; font-weight: 300; letter-spacing: 6px;
      text-transform: uppercase; color: ${c.muted};
    }
    /* Multi-layer title shadow */
    .title-shadow {
      text-shadow:
        0 4px 30px rgba(0,0,0,0.6),
        0 0 80px ${c.accent}33,
        0 0 160px ${c.primary}1a;
    }
    /* Full-bleed image with dark gradient overlay (PDF-safe smooth gradient) */
    .img-bleed { position: absolute; inset: 0; z-index: 0; object-fit: cover; width: 100%; height: 100%; }
    .img-overlay {
      position: absolute; inset: 0; z-index: 1; pointer-events: none;
      background: linear-gradient(180deg,
        rgba(0,0,0,0.85) 0%,
        rgba(0,0,0,0.4) 50%,
        rgba(0,0,0,0.2) 100%);
    }
    /* Editable markers — invisible to render, used by editor */
    [data-editable] { /* visual unchanged; editor attaches overlays */ }
  `
}

function htmlDoc(innerBody: string, css: string, extraHead = ''): string {
  return `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@100;300;400;500;700;800;900&display=swap" rel="stylesheet">
<style>${css}</style>
${extraHead}
</head><body>${innerBody}</body></html>`
}

function esc(s: string | undefined): string {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── Layout renderers ────────────────────────────────────

function renderHeroCover(slots: HeroCoverSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  return `<div class="slide">
    ${slots.backgroundImage ? `<img src="${esc(slots.backgroundImage)}" class="img-bleed" alt="" />
    <div class="img-overlay"></div>` : ''}
    <div class="atm-1"></div>
    <div class="stripe-top"></div>
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    <div style="position:absolute; bottom:160px; right:80px; left:80px; z-index:10;">
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:${(slots.title || '').length > 25 ? '120px' : '180px'}; font-weight:900; line-height:0.9; letter-spacing:-5px; color:${c.text}; margin-bottom:24px; max-width:1200px;">
        ${esc(slots.title)}
      </h1>
      ${slots.subtitle ? `<h2 data-editable="text" data-role="subtitle"
          style="font-size:28px; font-weight:300; letter-spacing:2px; color:${c.muted}; max-width:900px;">
          ${esc(slots.subtitle)}
      </h2>` : ''}
    </div>
    ${slots.tagline ? `<div style="position:absolute; top:40%; left:80px; width:4px; height:100px; background:${c.primary}; z-index:6;"></div>` : ''}
    <div class="slide-num">${esc(slots.brandName).toUpperCase()}</div>
  </div>`
}

function renderFullBleedImageText(slots: FullBleedImageTextSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  return `<div class="slide">
    <img data-editable="image" data-role="hero" src="${esc(slots.image)}" class="img-bleed" alt="" />
    <div class="img-overlay"></div>
    <div class="atm-1"></div>
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    <div style="position:absolute; right:80px; top:50%; transform:translateY(-50%); width:780px; z-index:10;">
      <div style="width:4px; height:80px; background:${c.primary}; margin-bottom:32px;"></div>
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:96px; font-weight:900; line-height:1.0; color:${c.text}; margin-bottom:24px; letter-spacing:-4px;">
        ${esc(slots.title)}
      </h1>
      ${slots.subtitle ? `<h2 data-editable="text" data-role="subtitle"
          style="font-size:32px; font-weight:400; color:${c.muted}; margin-bottom:24px; line-height:1.3;">
          ${esc(slots.subtitle)}
      </h2>` : ''}
      ${slots.body ? `<p data-editable="text" data-role="body"
          style="font-size:22px; font-weight:300; color:${c.text}cc; line-height:1.6; max-width:700px;">
          ${esc(slots.body)}
      </p>` : ''}
    </div>
  </div>`
}

function renderSplitImageText(slots: SplitImageTextSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  const isLeft = slots.imageSide === 'left'
  return `<div class="slide">
    <div class="atm-1"></div>
    <!-- Image side -->
    <div style="position:absolute; top:0; ${isLeft ? 'left:0' : 'right:0'}; width:60%; height:100%; z-index:0;">
      <img data-editable="image" data-role="hero" src="${esc(slots.image)}" style="width:100%; height:100%; object-fit:cover;" alt="" />
      <div style="position:absolute; inset:0; background: linear-gradient(${isLeft ? '90deg' : '270deg'}, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 70%, ${c.background}dd 100%);"></div>
    </div>
    <!-- Text side -->
    <div style="position:absolute; top:0; ${isLeft ? 'right:0' : 'left:0'}; width:45%; height:100%; z-index:10; padding:120px 80px; display:flex; flex-direction:column; justify-content:center;">
      ${slots.eyebrowLabel ? `<div data-editable="text" data-role="eyebrow"
          style="font-size:13px; font-weight:300; letter-spacing:8px; text-transform:uppercase; color:${c.muted}; margin-bottom:24px;">
          ${esc(slots.eyebrowLabel)}
      </div>` : ''}
      <div style="width:4px; height:60px; background:${c.primary}; margin-bottom:28px;"></div>
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:72px; font-weight:900; line-height:1.0; color:${c.text}; margin-bottom:28px; letter-spacing:-3px;">
        ${esc(slots.title)}
      </h1>
      ${slots.bodyText ? `<p data-editable="text" data-role="body"
          style="font-size:22px; font-weight:300; color:${c.text}cc; line-height:1.7; margin-bottom:20px;">
          ${esc(slots.bodyText)}
      </p>` : ''}
      ${slots.bullets && slots.bullets.length > 0 ? `<ul data-editable="list" data-role="bullets" style="list-style:none; margin-top:12px;">
        ${slots.bullets.map(b => `<li style="font-size:20px; color:${c.text}dd; padding-right:24px; position:relative; margin-bottom:14px; line-height:1.5;">
          <span style="position:absolute; right:0; color:${c.primary}; font-size:24px;">●</span>
          ${esc(b)}
        </li>`).join('')}
      </ul>` : ''}
    </div>
    <div class="stripe-bottom"></div>
  </div>`
}

function renderCenteredInsight(slots: CenteredInsightSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  return `<div class="slide">
    <div class="atm-1"></div>
    <!-- Giant hollow watermark -->
    <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-8deg); font-size:400px; font-weight:900; -webkit-text-stroke:2px ${c.text}0f; color:transparent; white-space:nowrap; z-index:2; pointer-events:none;">
      INSIGHT
    </div>
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    <div style="position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:0 160px; text-align:center;">
      ${slots.dataPoint ? `<div data-editable="text" data-role="data-point"
          style="font-size:180px; font-weight:900; color:${c.primary}; letter-spacing:-6px; line-height:0.9; text-shadow:0 0 80px ${c.primary}44; margin-bottom:16px;">
          ${esc(slots.dataPoint)}
      </div>` : ''}
      ${slots.dataLabel ? `<div data-editable="text" data-role="data-label"
          style="font-size:20px; font-weight:300; color:${c.muted}; letter-spacing:4px; text-transform:uppercase; margin-bottom:48px;">
          ${esc(slots.dataLabel)}
      </div>` : ''}
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:64px; font-weight:700; line-height:1.3; color:${c.text}; max-width:1400px; letter-spacing:-1px;">
        ${esc(slots.title)}
      </h1>
      ${slots.source ? `<div data-editable="text" data-role="source"
          style="font-size:14px; font-weight:300; color:${c.muted}; letter-spacing:2px; margin-top:40px; opacity:0.6;">
          ${esc(slots.source)}
      </div>` : ''}
    </div>
    <div class="corner-tl"></div>
    <div class="corner-br"></div>
  </div>`
}

function renderThreePillarsGrid(slots: ThreePillarsGridSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  const hasImage = !!slots.sideImage
  // When a side image is present, pillars compress to 60% width on the right
  // and the image takes 35% on the left as a vertical band. Otherwise pillars
  // span the full width as before.
  const pillarsLeftRight = hasImage
    ? `top:50%; right:80px; left:38%; transform:translateY(-40%);`
    : `top:50%; right:80px; left:80px; transform:translateY(-40%);`
  return `<div class="slide">
    <div class="atm-1"></div>
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    ${hasImage ? `
      <div data-editable="image" data-role="side-image"
           style="position:absolute; top:120px; bottom:80px; left:80px; width:30%; z-index:8; border-radius:24px; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,0.4);">
        <img src="${esc(slots.sideImage!)}" alt=""
             style="width:100%; height:100%; object-fit:cover; display:block;" />
        <div style="position:absolute; inset:0; background:linear-gradient(135deg, ${c.primary}22, transparent 60%); pointer-events:none;"></div>
      </div>` : ''}
    <div style="position:absolute; top:80px; ${hasImage ? 'left:38%;' : 'left:80px;'} right:80px; z-index:10;">
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:${hasImage ? '60px' : '72px'}; font-weight:900; line-height:1.0; color:${c.text}; letter-spacing:-3px;">
        ${esc(slots.title)}
      </h1>
    </div>
    <div style="position:absolute; ${pillarsLeftRight} display:flex; gap:${hasImage ? '24px' : '40px'}; z-index:10;">
      ${(slots.pillars || []).slice(0, 3).map((p, i) => `
        <div data-editable="pillar" data-role="pillar-${i}"
             style="flex:1; background:${c.cardBg}; backdrop-filter:blur(12px); border:1px solid ${c.text}15; border-radius:20px; padding:${hasImage ? '32px 24px' : '48px 32px'}; position:relative;">
          <div style="font-size:${hasImage ? '72px' : '96px'}; font-weight:900; color:${i === 1 ? c.primary : c.text}22; line-height:1; margin-bottom:${hasImage ? '16px' : '24px'}; ${i !== 1 ? `-webkit-text-stroke:2px ${c.text}30; color:transparent;` : `text-shadow:0 0 60px ${c.primary}66;`}">
            ${esc(p.number)}
          </div>
          <h3 data-editable="text" style="font-size:${hasImage ? '22px' : '28px'}; font-weight:700; color:${c.text}; margin-bottom:${hasImage ? '12px' : '16px'}; letter-spacing:-0.5px;">
            ${esc(p.title)}
          </h3>
          <p data-editable="text" style="font-size:${hasImage ? '13px' : '16px'}; font-weight:300; color:${c.muted}; line-height:1.6;">
            ${esc(p.description)}
          </p>
        </div>
      `).join('')}
    </div>
    <div class="stripe-bottom"></div>
  </div>`
}

function renderNumberedStats(slots: NumberedStatsSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  const hasBg = !!slots.backgroundImage
  return `<div class="slide">
    <div class="atm-1"></div>
    ${hasBg ? `
      <div data-editable="image" data-role="bg-image"
           style="position:absolute; inset:0; z-index:1;">
        <img src="${esc(slots.backgroundImage!)}" alt=""
             style="width:100%; height:100%; object-fit:cover; opacity:0.28; filter:saturate(0.8); display:block;" />
        <div style="position:absolute; inset:0; background:linear-gradient(180deg, ${c.background}cc 0%, ${c.background}99 50%, ${c.background}ee 100%); pointer-events:none;"></div>
      </div>` : ''}
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    <div style="position:absolute; top:80px; right:80px; left:80px; z-index:10;">
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:64px; font-weight:900; line-height:1.0; color:${c.text}; letter-spacing:-2px;">
        ${esc(slots.title)}
      </h1>
    </div>
    <div style="position:absolute; top:50%; right:80px; left:80px; transform:translateY(-30%); display:grid; grid-template-columns: repeat(${Math.min((slots.stats || []).length || 1, 4)}, 1fr); gap:40px; z-index:10;">
      ${(slots.stats || []).map((stat, i) => `
        <div data-editable="stat" data-role="stat-${i}" style="text-align:right;">
          <div style="font-size:120px; font-weight:900; color:${stat.accent !== false ? c.primary : c.text}; letter-spacing:-4px; line-height:1; margin-bottom:12px; text-shadow:0 0 60px ${c.primary}44;">
            ${esc(stat.value)}
          </div>
          <div style="font-size:18px; font-weight:300; color:${c.muted}; letter-spacing:1px;">
            ${esc(stat.label)}
          </div>
        </div>
      `).join('')}
    </div>
    <div class="stripe-bottom"></div>
  </div>`
}

function renderInfluencerGrid(slots: InfluencerGridSlots, ds: DesignSystem): string {
  const { colors: c } = ds
  return `<div class="slide">
    <div class="atm-1"></div>
    ${slots.eyebrowLabel ? `<div class="eyebrow" data-editable="text" data-role="eyebrow">${esc(slots.eyebrowLabel)}</div>` : ''}
    <div style="position:absolute; top:80px; right:80px; left:80px; z-index:10;">
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:64px; font-weight:900; line-height:1.0; color:${c.text}; letter-spacing:-2px; margin-bottom:12px;">
        ${esc(slots.title)}
      </h1>
      ${slots.subtitle ? `<p data-editable="text" data-role="subtitle" style="font-size:20px; font-weight:300; color:${c.muted};">${esc(slots.subtitle)}</p>` : ''}
    </div>
    <div style="position:absolute; top:280px; right:80px; left:80px; bottom:80px; display:grid; grid-template-columns: repeat(3, 1fr); gap:24px; z-index:10;">
      ${(slots.influencers || []).slice(0, 6).map(inf => `
        <div data-editable="influencer" style="background:${c.cardBg}; backdrop-filter:blur(12px); border:1px solid ${c.text}15; border-radius:16px; padding:24px; display:flex; flex-direction:column; align-items:center; text-align:center;">
          ${inf.profilePicUrl
            ? `<img src="${esc(inf.profilePicUrl)}" style="width:96px; height:96px; border-radius:50%; border:3px solid ${c.primary}; object-fit:cover; margin-bottom:16px;" alt="${esc(inf.name)}" />`
            : `<div style="width:96px; height:96px; border-radius:50%; background:${c.primary}; display:flex; align-items:center; justify-content:center; font-size:40px; font-weight:900; color:${c.background}; margin-bottom:16px;">${esc(inf.name.charAt(0))}</div>`
          }
          <div style="font-size:20px; font-weight:700; color:${c.text}; margin-bottom:4px;">
            ${esc(inf.name)} ${inf.isVerified ? `<span style="color:${c.primary}; font-size:14px;">✓</span>` : ''}
          </div>
          <div style="font-size:13px; color:${c.muted}; margin-bottom:16px;">@${esc(inf.handle)}</div>
          <div style="display:flex; gap:16px; font-size:14px;">
            <div><div style="font-weight:700; color:${c.primary};">${esc(inf.followers)}</div><div style="color:${c.muted}; font-size:11px;">עוקבים</div></div>
            <div style="width:1px; background:${c.text}20;"></div>
            <div><div style="font-weight:700; color:${c.primary};">${esc(inf.engagement)}</div><div style="color:${c.muted}; font-size:11px;">ER</div></div>
          </div>
        </div>
      `).join('')}
    </div>
  </div>`
}

function renderClosingCTA(slots: ClosingCTASlots, ds: DesignSystem): string {
  const { colors: c } = ds
  return `<div class="slide">
    ${slots.backgroundImage ? `<img src="${esc(slots.backgroundImage)}" class="img-bleed" alt="" />
    <div class="img-overlay"></div>` : ''}
    <div class="atm-1"></div>
    <div style="position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
      <h1 data-editable="text" data-role="title" class="title-shadow"
          style="font-size:160px; font-weight:900; color:${c.text}; letter-spacing:-6px; line-height:0.9; margin-bottom:40px;">
        ${esc(slots.title)}
      </h1>
      <div style="width:100px; height:2px; background:${c.primary}; margin-bottom:40px;"></div>
      ${slots.tagline ? `<div data-editable="text" data-role="tagline"
          style="font-size:22px; font-weight:300; letter-spacing:6px; text-transform:uppercase; color:${c.muted};">
          ${esc(slots.tagline)}
      </div>` : ''}
    </div>
    <div class="corner-tl"></div>
    <div class="corner-br"></div>
  </div>`
}

// ─── Public API: render one slide to HTML string ────────

export interface RenderOptions {
  /** When true, injects an in-iframe editor script that allows drag/resize of [data-role] elements. */
  editor?: boolean
  /** Show a 40px grid overlay */
  grid?: boolean
  /** Snap drag/nudge to the grid */
  snap?: boolean
  /** Brand's own logo URL (scraped). Renders top-right opposite the Leaders mark. */
  brandLogoUrl?: string
}

/**
 * Logo overlay rendered on every non-cover/non-closing slide:
 * - Leaders mark top-left ("powered by Leaders")
 * - Brand logo top-right (if scraped)
 * Cover and closing slides have their own dedicated branding so we skip them.
 *
 * Uses an absolute URL for the Leaders logo so it renders inside iframe
 * srcDoc (about:blank origin) and inside Playwright PDF generation, where
 * relative paths like "/logo.png" don't resolve.
 */
const LEADERS_LOGO_URL = 'https://fhgggqnaplshwbrzgima.supabase.co/storage/v1/object/public/assets/branding/leaders-logo.png'

function renderLogoOverlay(layout: string, brandLogoUrl?: string): string {
  if (layout === 'hero-cover' || layout === 'closing-cta') return ''
  const leadersMark = `
    <div data-role="leaders-mark" style="position:absolute; top:32px; left:32px; z-index:30; display:flex; align-items:center; gap:8px; pointer-events:none; opacity:0.85;">
      <img src="${LEADERS_LOGO_URL}" alt="Leaders" style="height:24px; width:auto; filter:brightness(0) invert(1);" />
      <span style="font-size:10px; font-weight:500; color:rgba(255,255,255,0.6); letter-spacing:1.5px; text-transform:uppercase;">Leaders</span>
    </div>`
  const brandMark = brandLogoUrl
    ? `<div data-role="brand-mark" style="position:absolute; top:24px; right:32px; z-index:30; pointer-events:none; opacity:0.9;">
         <img src="${brandLogoUrl}" alt="brand" style="height:36px; width:auto; max-width:140px; object-fit:contain;" />
       </div>`
    : ''
  return leadersMark + brandMark
}

export function renderStructuredSlide(
  slide: StructuredSlide,
  ds: DesignSystem,
  opts: RenderOptions = {},
): string {
  let body: string
  switch (slide.layout) {
    case 'hero-cover':
      body = renderHeroCover(slide.slots as HeroCoverSlots, ds); break
    case 'full-bleed-image-text':
      body = renderFullBleedImageText(slide.slots as FullBleedImageTextSlots, ds); break
    case 'split-image-text':
      body = renderSplitImageText(slide.slots as SplitImageTextSlots, ds); break
    case 'centered-insight':
      body = renderCenteredInsight(slide.slots as CenteredInsightSlots, ds); break
    case 'three-pillars-grid':
      body = renderThreePillarsGrid(slide.slots as ThreePillarsGridSlots, ds); break
    case 'numbered-stats':
      body = renderNumberedStats(slide.slots as NumberedStatsSlots, ds); break
    case 'influencer-grid':
      body = renderInfluencerGrid(slide.slots as InfluencerGridSlots, ds); break
    case 'closing-cta':
      body = renderClosingCTA(slide.slots as ClosingCTASlots, ds); break
    default:
      body = `<div class="slide"><h1 style="padding:80px;">Unknown layout: ${(slide as StructuredSlide).layout}</h1></div>`
  }
  body = decorateDecorations(body)
  body = injectFreeElements(body, slide.freeElements)
  body = applyElementStyles(body, slide.elementStyles)
  body = applyHidden(body, slide.hiddenRoles)
  body = applyBg(body, slide.bg)
  // Logo overlay — Leaders mark + brand logo on every non-cover/closing slide.
  const logoOverlay = renderLogoOverlay(slide.layout, opts.brandLogoUrl)
  if (logoOverlay) body = body.replace(/<\/div>\s*$/, `${logoOverlay}</div>`)
  const gridOverlay = opts.grid
    ? `<div style="position:absolute; inset:0; z-index:8; pointer-events:none; background-image: linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px); background-size: 40px 40px;"></div>`
    : ''
  body = body.replace(/<\/div>\s*$/, `${gridOverlay}</div>`)
  const snapConfig = `<script>window.__gammaSnap=${opts.snap ? 40 : 0};</script>`
  const extra = snapConfig + REPARENT_SCRIPT + (opts.editor ? EDITOR_SCRIPT : '')
  return htmlDoc(body, buildCommonCss(ds), extra)
}

// ─── Element style overrides (hybrid free-move) ──────────

/**
 * Walk the rendered HTML, find each [data-role="X"] tag, and append
 * the matching elementStyles[X] CSS string to its inline style attribute.
 * Overrides win because they come last.
 */
function applyElementStyles(html: string, overrides?: Record<string, string>): string {
  if (!overrides || Object.keys(overrides).length === 0) return html
  return html.replace(/data-role="([^"]+)"([^>]*)/g, (match, role, rest) => {
    const override = overrides[role]
    if (!override) return match
    // Add data-overridden marker so the reparent script knows to lift this element to .slide
    if (/style="/.test(rest)) {
      const newRest = rest.replace(/style="([^"]*)"/, (_m: string, existing: string) => {
        const sep = existing.trim().endsWith(';') ? '' : ';'
        return `style="${existing}${sep}${override}" data-overridden="1"`
      })
      return `data-role="${role}"${newRest}`
    }
    return `data-role="${role}"${rest} data-overridden="1" style="${override}"`
  })
}

/** Always-on script: reparents elements with [data-overridden] to be direct children of .slide */
const REPARENT_SCRIPT = `
<script>
(function(){
  function lift() {
    const slide = document.querySelector('.slide');
    if (!slide) return;
    document.querySelectorAll('[data-overridden="1"]').forEach(el => {
      if (el.parentNode === slide) return;
      slide.appendChild(el);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lift);
  } else { lift(); }
})();
</script>`

// ─── Decorations: make them selectable ────────────────────

const DECOR_CLASSES = ['atm-1', 'stripe-top', 'stripe-bottom', 'corner-tl', 'corner-br', 'slide-num', 'img-bleed', 'img-overlay']

function decorateDecorations(body: string): string {
  let out = body
  for (const cls of DECOR_CLASSES) {
    const re = new RegExp(`(<(?:div|img)\\s+[^>]*?class="${cls}"(?![^>]*data-role))`, 'g')
    out = out.replace(re, `$1 data-role="decor-${cls}" data-editable="decor"`)
  }
  return out
}

function applyBg(body: string, bg?: { color?: string; image?: string }): string {
  if (!bg || (!bg.color && !bg.image)) return body
  const parts: string[] = []
  if (bg.color) parts.push(`background-color:${bg.color} !important`)
  if (bg.image) parts.push(`background-image:url("${bg.image}") !important; background-size:cover !important; background-position:center !important`)
  return body.replace(/class="slide"/, `class="slide" style="${parts.join(';')}"`)
}

function applyHidden(body: string, hidden?: string[]): string {
  if (!hidden || hidden.length === 0) return body
  let out = body
  for (const role of hidden) {
    const re = new RegExp(`(data-role="${role}"[^>]*?)(>)`, 'g')
    out = out.replace(re, '$1 style="display:none"$2')
  }
  return out
}

// ─── Free elements injection ──────────────────────────────

import type { FreeElement } from './types'

function injectFreeElements(body: string, free?: FreeElement[]): string {
  if (!free || free.length === 0) return body
  const fragments = free.map((el) => {
    const baseStyle = el.style || 'position:absolute; left:760px; top:440px; width:400px; height:200px; z-index:50;'
    const safeRole = el.id.replace(/"/g, '')
    if (el.kind === 'image') {
      return `<img data-role="${safeRole}" data-editable="image" src="${esc(el.src || '')}" alt="" style="${baseStyle}; object-fit:cover; border-radius:8px;" />`
    }
    if (el.kind === 'video') {
      return `<video data-role="${safeRole}" data-editable="video" src="${esc(el.src || '')}" autoplay loop muted playsinline style="${baseStyle}; object-fit:cover; border-radius:8px;"></video>`
    }
    if (el.kind === 'shape') {
      const fill = el.fill || 'rgba(233,69,96,0.25)'
      const stroke = el.stroke ? `border:3px solid ${el.stroke};` : ''
      if (el.shape === 'circle') {
        return `<div data-role="${safeRole}" data-editable="shape" style="${baseStyle}; background:${fill}; ${stroke} border-radius:50%;"></div>`
      }
      if (el.shape === 'line') {
        return `<div data-role="${safeRole}" data-editable="shape" style="${baseStyle}; background:${el.stroke || fill}; height:4px;"></div>`
      }
      return `<div data-role="${safeRole}" data-editable="shape" style="${baseStyle}; background:${fill}; ${stroke} border-radius:8px;"></div>`
    }
    const fmt = formatToCss(el.format)
    return `<div data-role="${safeRole}" data-editable="text" style="${baseStyle}; color:#fff; font-size:32px; font-weight:600; padding:12px; ${fmt}">${esc(el.text || '')}</div>`
  }).join('\n')
  return body.replace(/<\/div>\s*$/, `${fragments}</div>`)
}

function formatToCss(f?: FreeElement['format']): string {
  if (!f) return ''
  const parts: string[] = []
  if (f.fontSize) parts.push(`font-size:${f.fontSize}px`)
  if (f.fontWeight) parts.push(`font-weight:${f.fontWeight}`)
  if (f.color) parts.push(`color:${f.color}`)
  if (f.textAlign) parts.push(`text-align:${f.textAlign}`)
  if (f.fontStyle) parts.push(`font-style:${f.fontStyle}`)
  if (f.textDecoration) parts.push(`text-decoration:${f.textDecoration}`)
  return parts.join(';') + (parts.length ? ';' : '')
}

// ─── In-iframe editor: drag + resize ──────────────────────

const EDITOR_SCRIPT = `
<style>
  [data-role] { cursor: grab; transition: outline 0.1s; user-select: none; }
  [data-role]:hover { outline: 2px dashed #E94560; outline-offset: 2px; }
  [data-role].__selected { outline: 2px solid #E94560 !important; outline-offset: 2px; }
  [data-role].__editing { outline: 2px solid #4CAF50 !important; cursor: text; user-select: text; background: rgba(76,175,80,0.05); }
  [data-role][contenteditable="true"] { cursor: text; user-select: text; }
  .__handle {
    position: absolute; width: 18px; height: 18px;
    background: #E94560; border: 2px solid #fff; border-radius: 3px;
    z-index: 9999; pointer-events: auto;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  }
  .__handle.br { cursor: nwse-resize; }
  .__handle.del { background: #b00020; cursor: pointer; color: #fff; font-weight: bold; font-family: sans-serif; font-size: 14px; line-height: 14px; text-align: center; }
</style>
<script>
function __gammaInit(){
  const SLIDE = document.querySelector('.slide');
  if (!SLIDE) { console.warn('[gamma-editor] no .slide'); return; }
  console.log('[gamma-editor] init — slide found');
  let selected = null;
  let dragging = null;
  let handles = [];
  const DRAG_THRESHOLD = 3;

  function getSlideMetrics() {
    const sr = SLIDE.getBoundingClientRect();
    return { sr, scaleX: 1920 / sr.width, scaleY: 1080 / sr.height };
  }

  function clearSelection() {
    if (selected) selected.classList.remove('__selected');
    handles.forEach(h => h.remove()); handles = [];
    selected = null;
    parent.postMessage({ type: 'gamma-selected', role: null }, '*');
  }

  function selectEl(el) {
    if (selected === el) return;
    clearSelection();
    selected = el;
    el.classList.add('__selected');
    parent.postMessage({ type: 'gamma-selected', role: el.getAttribute('data-role') }, '*');
    const br = document.createElement('div');
    br.className = '__handle br';
    SLIDE.appendChild(br);
    handles.push(br);
    if (el.getAttribute('data-role').startsWith('free-')) {
      const del = document.createElement('div');
      del.className = '__handle del';
      del.textContent = '×';
      del.addEventListener('pointerdown', (ev) => {
        ev.preventDefault(); ev.stopPropagation();
        parent.postMessage({ type: 'gamma-delete-free', role: el.getAttribute('data-role') }, '*');
      });
      SLIDE.appendChild(del);
      handles.push(del);
    }
    positionHandles();
  }

  function positionHandles() {
    if (!selected || handles.length === 0) return;
    const r = selected.getBoundingClientRect();
    const { sr, scaleX, scaleY } = getSlideMetrics();
    const right = (r.right - sr.left) * scaleX;
    const bottom = (r.bottom - sr.top) * scaleY;
    const left = (r.left - sr.left) * scaleX;
    const top = (r.top - sr.top) * scaleY;
    const br = handles[0];
    if (br) { br.style.left = (right - 9) + 'px'; br.style.top = (bottom - 9) + 'px'; }
    const del = handles[1];
    if (del) { del.style.left = (right - 9) + 'px'; del.style.top = (top - 9) + 'px'; }
  }

  function commitMove() {
    if (!selected) return;
    const role = selected.getAttribute('data-role');
    const s = selected.style;
    const parts = [];
    ['position','left','top','right','bottom','transform','width','height','maxWidth'].forEach(k => {
      const v = s[k]; if (v) parts.push((k === 'maxWidth' ? 'max-width' : k) + ':' + v);
    });
    parent.postMessage({ type: 'gamma-edit', role, styleString: parts.join(';') }, '*');
  }

  function commitText() {
    if (!selected) return;
    const role = selected.getAttribute('data-role');
    const text = selected.innerText;
    parent.postMessage({ type: 'gamma-text', role, text }, '*');
  }

  // Paste-as-plain-text in contentEditable elements
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (!t || !t.hasAttribute || !t.hasAttribute('data-role')) return;
    if (t.contentEditable !== 'true') return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  // Image hover-edit button — works on the element under the cursor, not via mouseover on img
  // (img is often covered by positioned content, so mouseover rarely fires on it)
  let imgHoverBtn = null;
  let imgHoverTarget = null;

  function findImageUnderPoint(x, y) {
    // document.elementsFromPoint returns the stack at x,y — find any img[data-role] or element
    // whose ::backdrop is the slide image. We prefer img-bleed or any img with data-role.
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (el.tagName === 'IMG' && el.hasAttribute('data-role')) return el;
    }
    // fallback: check if the topmost slide has a .img-bleed (bg image)
    if (stack.some(el => el === SLIDE || el.closest && el.closest('.slide') === SLIDE)) {
      const bleed = SLIDE.querySelector('img.img-bleed[data-role], img[data-role]');
      if (bleed) return bleed;
    }
    return null;
  }

  function showImgHover(el) {
    if (imgHoverTarget === el && imgHoverBtn) return; // already showing
    hideImgHover();
    imgHoverTarget = el;
    imgHoverBtn = document.createElement('button');
    imgHoverBtn.textContent = '✎ החלף תמונה';
    imgHoverBtn.style.cssText = 'position:absolute; background:#E94560; color:#fff; border:0; border-radius:6px; padding:10px 18px; font:600 15px Heebo,sans-serif; cursor:pointer; z-index:99999; box-shadow:0 6px 20px rgba(0,0,0,0.6); direction:rtl; pointer-events:auto; transition:transform 0.15s;';
    imgHoverBtn.addEventListener('mouseenter', () => { imgHoverBtn.style.transform = 'scale(1.05)'; });
    imgHoverBtn.addEventListener('mouseleave', () => { imgHoverBtn.style.transform = 'none'; });
    // Use mousedown (fires before any pointerdown cleanup) + click for safety
    const fire = (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const role = imgHoverTarget && imgHoverTarget.getAttribute('data-role');
      if (role) parent.postMessage({ type: 'gamma-swap-image', role }, '*');
    };
    imgHoverBtn.addEventListener('mousedown', fire);
    imgHoverBtn.addEventListener('click', fire);
    SLIDE.appendChild(imgHoverBtn);
    const r = el.getBoundingClientRect();
    const m = getSlideMetrics();
    const cx = ((r.left + r.right) / 2 - m.sr.left) * m.scaleX;
    const cy = ((r.top + r.bottom) / 2 - m.sr.top) * m.scaleY;
    imgHoverBtn.style.left = (cx - 80) + 'px';
    imgHoverBtn.style.top = (cy - 22) + 'px';
  }
  function hideImgHover() {
    if (imgHoverBtn) imgHoverBtn.remove();
    imgHoverBtn = null; imgHoverTarget = null;
  }

  // Use mousemove on document — check if an image is under the pointer
  let mouseMoveTimer = null;
  document.addEventListener('mousemove', (e) => {
    if (mouseMoveTimer) return;
    mouseMoveTimer = setTimeout(() => { mouseMoveTimer = null; }, 80);
    // Ignore when dragging or hovering a handle / selected outline
    if (dragging) return;
    if (e.target && e.target.classList && (e.target.classList.contains('__handle') || e.target === imgHoverBtn)) return;
    const img = findImageUnderPoint(e.clientX, e.clientY);
    if (img) {
      showImgHover(img);
    } else {
      // Only hide if pointer is not over the button
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el !== imgHoverBtn) hideImgHover();
    }
  });

  // Double-click → inline text editing
  document.addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-role]');
    if (!el) return;
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO') return;
    e.preventDefault(); e.stopPropagation();
    selectEl(el);
    el.contentEditable = 'true';
    el.classList.add('__editing');
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
  });

  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (!el || !el.getAttribute || !el.hasAttribute('data-role')) return;
    if (el.contentEditable !== 'true') return;
    el.contentEditable = 'false';
    el.classList.remove('__editing');
    commitText();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected && selected.contentEditable === 'true') {
      selected.blur();
    }
    if (e.key === 'Delete' && selected && selected.getAttribute('data-role').startsWith('free-') && selected.contentEditable !== 'true') {
      e.preventDefault();
      parent.postMessage({ type: 'gamma-delete-free', role: selected.getAttribute('data-role') }, '*');
    }
    // Arrow-key nudge
    if (selected && !selected.isContentEditable && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const snapSize = window.__gammaSnap || 0;
      const delta = snapSize > 0 && e.shiftKey ? snapSize : step;
      if (selected.parentNode !== SLIDE) {
        const r = selected.getBoundingClientRect();
        const { sr, scaleX, scaleY } = getSlideMetrics();
        selected.style.position = 'absolute';
        selected.style.left = ((r.left - sr.left) * scaleX) + 'px';
        selected.style.top = ((r.top - sr.top) * scaleY) + 'px';
        selected.style.right = 'auto'; selected.style.bottom = 'auto';
        selected.style.transform = 'none'; selected.style.margin = '0';
        SLIDE.appendChild(selected);
      }
      const cur = { x: parseFloat(selected.style.left) || 0, y: parseFloat(selected.style.top) || 0 };
      if (e.key === 'ArrowLeft') cur.x -= delta;
      if (e.key === 'ArrowRight') cur.x += delta;
      if (e.key === 'ArrowUp') cur.y -= delta;
      if (e.key === 'ArrowDown') cur.y += delta;
      selected.style.left = cur.x + 'px';
      selected.style.top = cur.y + 'px';
      positionHandles();
      commitMove();
    }
  });

  // External selection via postMessage from parent (layers panel)
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'gamma-select') {
      const el = document.querySelector('[data-role="' + ev.data.role + '"]');
      if (el) selectEl(el);
    }
    if (ev.data && ev.data.type === 'gamma-deselect') clearSelection();
  });

  // Pointerdown: select immediately + start tracking (drag if movement, resize if on handle)
  document.addEventListener('pointerdown', (e) => {
    const isHandle = e.target.classList && e.target.classList.contains('__handle');
    const el = e.target.closest('[data-role]');

    if (isHandle && e.target.classList.contains('br') && selected) {
      e.preventDefault();
      const r = selected.getBoundingClientRect();
      const { scaleX, scaleY } = getSlideMetrics();
      dragging = { mode: 'resize', startX: e.clientX, startY: e.clientY,
        origW: r.width * scaleX, origH: r.height * scaleY, moved: false };
      return;
    }

    if (!el) { clearSelection(); return; }
    if (el.contentEditable === 'true') return; // editing mode — let text events through

    e.preventDefault();
    selectEl(el);
    // Lift to .slide so absolute positioning is relative to the slide
    if (el.parentNode !== SLIDE) {
      const r0 = el.getBoundingClientRect();
      const m0 = getSlideMetrics();
      const x0 = (r0.left - m0.sr.left) * m0.scaleX;
      const y0 = (r0.top - m0.sr.top) * m0.scaleY;
      const w0 = r0.width * m0.scaleX;
      el.style.position = 'absolute';
      el.style.left = x0 + 'px';
      el.style.top = y0 + 'px';
      el.style.width = w0 + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.transform = 'none';
      el.style.margin = '0';
      el.style.maxWidth = 'none';
      SLIDE.appendChild(el);
    }
    const r = el.getBoundingClientRect();
    const { sr, scaleX, scaleY } = getSlideMetrics();
    dragging = { mode: 'move', startX: e.clientX, startY: e.clientY,
      origX: (r.left - sr.left) * scaleX, origY: (r.top - sr.top) * scaleY, moved: false };
  });

  document.addEventListener('pointermove', (e) => {
    if (!dragging || !selected) return;
    const { scaleX, scaleY } = getSlideMetrics();
    const dx = (e.clientX - dragging.startX) * scaleX;
    const dy = (e.clientY - dragging.startY) * scaleY;
    if (!dragging.moved && Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY) > DRAG_THRESHOLD) {
      dragging.moved = true;
    }
    if (!dragging.moved) return;
    const snapSize = window.__gammaSnap || 0;
    const snapV = (v) => snapSize > 0 ? Math.round(v / snapSize) * snapSize : Math.round(v);
    if (dragging.mode === 'move') {
      let x = snapV(dragging.origX + dx);
      let y = snapV(dragging.origY + dy);
      const w = selected.offsetWidth || 200;
      const h = selected.offsetHeight || 100;
      // Smart guides: snap to slide-center and edges of other data-role elements
      const guides = computeSmartGuides(x, y, w, h, selected);
      if (guides.x !== null) x = guides.x;
      if (guides.y !== null) y = guides.y;
      renderGuides(guides);
      selected.style.position = 'absolute';
      selected.style.left = x + 'px';
      selected.style.top = y + 'px';
      selected.style.right = 'auto';
      selected.style.bottom = 'auto';
      selected.style.transform = 'none';
    } else if (dragging.mode === 'resize') {
      const w = Math.max(40, snapV(dragging.origW + dx));
      const h = Math.max(20, snapV(dragging.origH + dy));
      selected.style.width = w + 'px';
      selected.style.height = h + 'px';
      selected.style.maxWidth = 'none';
    }
    positionHandles();
  });

  document.addEventListener('pointerup', () => {
    if (dragging && dragging.moved) commitMove();
    dragging = null;
    clearGuides();
  });

  // ── Smart guides (alignment lines) ──
  const GUIDE_THRESHOLD = 6; // slide-unit pixels
  const guideEls = { h: [], v: [] };

  function computeSmartGuides(x, y, w, h, el) {
    const targets = [];
    // Slide edges + center
    targets.push({ t: 'v', pos: 0 }, { t: 'v', pos: 960 }, { t: 'v', pos: 1920 });
    targets.push({ t: 'h', pos: 0 }, { t: 'h', pos: 540 }, { t: 'h', pos: 1080 });
    // Other elements' edges + centers
    document.querySelectorAll('[data-role]').forEach(other => {
      if (other === el) return;
      if (other.classList.contains('__handle') || other.classList.contains('__editing')) return;
      const r = other.getBoundingClientRect();
      const { sr, scaleX, scaleY } = getSlideMetrics();
      const ox = (r.left - sr.left) * scaleX;
      const oy = (r.top - sr.top) * scaleY;
      const ow = r.width * scaleX;
      const oh = r.height * scaleY;
      targets.push({ t: 'v', pos: ox }, { t: 'v', pos: ox + ow / 2 }, { t: 'v', pos: ox + ow });
      targets.push({ t: 'h', pos: oy }, { t: 'h', pos: oy + oh / 2 }, { t: 'h', pos: oy + oh });
    });

    const cx = x + w / 2;
    const cy = y + h / 2;
    const xRight = x + w;
    const yBottom = y + h;

    const hits = { x: null, y: null, xLines: [], yLines: [] };
    let bestVDist = GUIDE_THRESHOLD;
    let bestHDist = GUIDE_THRESHOLD;

    targets.forEach(tg => {
      if (tg.t === 'v') {
        // Check: left edge, center, right edge
        [
          { candidate: tg.pos, newX: tg.pos },
          { candidate: tg.pos, newX: tg.pos - w / 2 },
          { candidate: tg.pos, newX: tg.pos - w },
        ].forEach(({ candidate, newX }) => {
          // Check if our current computed edge or center is near the target
          const dists = [Math.abs(x - candidate), Math.abs(cx - candidate), Math.abs(xRight - candidate)];
          const minDist = Math.min(...dists);
          if (minDist < bestVDist) {
            bestVDist = minDist;
            hits.x = newX;
            hits.xLines = [candidate];
          }
        });
      } else {
        [
          { candidate: tg.pos, newY: tg.pos },
          { candidate: tg.pos, newY: tg.pos - h / 2 },
          { candidate: tg.pos, newY: tg.pos - h },
        ].forEach(({ candidate, newY }) => {
          const dists = [Math.abs(y - candidate), Math.abs(cy - candidate), Math.abs(yBottom - candidate)];
          const minDist = Math.min(...dists);
          if (minDist < bestHDist) {
            bestHDist = minDist;
            hits.y = newY;
            hits.yLines = [candidate];
          }
        });
      }
    });
    return hits;
  }

  function renderGuides(hits) {
    clearGuides();
    if (hits.xLines.length) {
      hits.xLines.forEach(pos => {
        const g = document.createElement('div');
        g.style.cssText = 'position:absolute; top:0; bottom:0; width:1px; background:#E94560; z-index:9997; pointer-events:none; box-shadow:0 0 4px #E94560;';
        g.style.left = pos + 'px';
        SLIDE.appendChild(g);
        guideEls.v.push(g);
      });
    }
    if (hits.yLines.length) {
      hits.yLines.forEach(pos => {
        const g = document.createElement('div');
        g.style.cssText = 'position:absolute; left:0; right:0; height:1px; background:#E94560; z-index:9997; pointer-events:none; box-shadow:0 0 4px #E94560;';
        g.style.top = pos + 'px';
        SLIDE.appendChild(g);
        guideEls.h.push(g);
      });
    }
  }

  function clearGuides() {
    guideEls.v.forEach(g => g.remove());
    guideEls.h.forEach(g => g.remove());
    guideEls.v = []; guideEls.h = [];
  }

  window.addEventListener('resize', positionHandles);
  setTimeout(positionHandles, 200);
  setTimeout(positionHandles, 800);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __gammaInit);
else __gammaInit();
</script>
`
