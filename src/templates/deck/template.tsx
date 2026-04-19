import type { DeckData, Slide, TemplateConfig } from '@/types/documents'

interface DeckTemplateProps {
  data: DeckData
  config: TemplateConfig
}

export function renderSlideToHtml(
  slide: Slide, 
  slideIndex: number,
  totalSlides: number,
  deckTitle: string,
  config: TemplateConfig
): string {
  const styles = getStyleConfig(config)
  
  const slideContent = renderSlideContent(slide, config)
  
  return `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${slide.headline || deckTitle} - שקופית ${slideIndex + 1}</title>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800;900&family=Assistant:wght@400;600;700&family=Rubik:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: 1920px 1080px; margin: 0; }
    body {
      font-family: '${config.fonts.body}', sans-serif;
      direction: rtl;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
    }
    .slide {
      width: 1920px;
      height: 1080px;
      padding: 80px;
      display: flex;
      flex-direction: column;
      position: relative;
      ${styles.background}
    }
    h1 {
      font-family: '${config.fonts.heading}', sans-serif;
      font-weight: 800;
      color: ${config.colors.text};
      margin-bottom: 40px;
    }
    h2 {
      font-family: '${config.fonts.heading}', sans-serif;
      font-weight: 700;
      color: ${config.colors.primary};
    }
    p {
      font-size: 32px;
      line-height: 1.6;
      color: ${config.colors.text}dd;
    }
    .headline { font-size: 72px; }
    .subheadline { font-size: 36px; color: ${config.colors.text}aa; margin-top: 20px; }
    .content { font-size: 28px; flex: 1; display: flex; flex-direction: column; justify-content: center; }
    .bullets { list-style: none; }
    .bullets li {
      font-size: 32px;
      padding: 20px 0;
      padding-right: 40px;
      position: relative;
      color: ${config.colors.text}dd;
    }
    .bullets li::before {
      content: '';
      position: absolute;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 12px;
      background: ${config.colors.accent};
      border-radius: 50%;
    }
    .footer {
      position: absolute;
      bottom: 40px;
      left: 80px;
      right: 80px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 20px;
      color: ${config.colors.text}66;
    }
    .page-number {
      font-weight: 600;
    }
    .accent-line {
      width: 100px;
      height: 6px;
      background: linear-gradient(90deg, ${config.colors.accent}, ${config.colors.primary});
      margin-bottom: 30px;
      border-radius: 3px;
    }
    .image-container {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      flex: 1;
    }
    .image-container img {
      max-height: 500px;
      max-width: 100%;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    }
    .moodboard {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 20px;
      flex: 1;
    }
    .moodboard img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 16px;
    }
    .comparison {
      display: flex;
      gap: 60px;
      flex: 1;
      align-items: center;
    }
    .comparison-side {
      flex: 1;
      padding: 40px;
      border-radius: 24px;
    }
    .comparison-before {
      background: ${config.colors.primary}15;
    }
    .comparison-after {
      background: ${config.colors.accent}15;
    }
    .comparison-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 30px;
      font-family: '${config.fonts.heading}', sans-serif;
    }
    .comparison-before .comparison-title { color: ${config.colors.primary}; }
    .comparison-after .comparison-title { color: ${config.colors.accent}; }
    
    /* Title slide special styling */
    .slide.title-slide {
      justify-content: center;
      align-items: center;
      text-align: center;
    }
    .slide.title-slide h1 {
      font-size: 100px;
      background: linear-gradient(135deg, ${config.colors.accent}, ${config.colors.primary});
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .slide.title-slide .accent-line {
      width: 200px;
      margin: 0 auto 40px;
    }
    
    /* Big idea slide */
    .slide.big-idea-slide .content {
      text-align: center;
      align-items: center;
    }
    .slide.big-idea-slide h1 {
      font-size: 80px;
      max-width: 80%;
    }
  </style>
</head>
<body>
  ${slideContent}
</body>
</html>
  `.trim()
}

function getStyleConfig(config: TemplateConfig) {
  return {
    background: `background: ${config.colors.background};`,
  }
}

function renderSlideContent(slide: Slide, config: TemplateConfig): string {
  switch (slide.type) {
    case 'title':
      return renderTitleSlide(slide, config)
    case 'context':
      return renderContextSlide(slide, config)
    case 'audience':
      return renderAudienceSlide(slide, config)
    case 'big_idea':
      return renderBigIdeaSlide(slide, config)
    case 'image_focus':
      return renderImageFocusSlide(slide, config)
    case 'moodboard':
      return renderMoodboardSlide(slide, config)
    case 'comparison':
      return renderComparisonSlide(slide, config)
    case 'summary':
      return renderSummarySlide(slide, config)
    default:
      return renderContextSlide(slide, config)
  }
}

function renderTitleSlide(slide: Slide, config: TemplateConfig): string {
  return `
    <div class="slide title-slide">
      <div class="accent-line"></div>
      <h1 class="headline">${slide.headline || ''}</h1>
      ${slide.subheadline ? `<p class="subheadline">${slide.subheadline}</p>` : ''}
    </div>
  `
}

function renderContextSlide(slide: Slide, config: TemplateConfig): string {
  return `
    <div class="slide">
      <div class="accent-line"></div>
      <h1 class="headline">${slide.headline || ''}</h1>
      <div class="content">
        ${slide.content ? `<p>${slide.content}</p>` : ''}
        ${slide.bullets ? `
          <ul class="bullets">
            ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    </div>
  `
}

function renderAudienceSlide(slide: Slide, config: TemplateConfig): string {
  return `
    <div class="slide">
      <div class="accent-line"></div>
      <h1 class="headline">${slide.headline || 'קהל היעד'}</h1>
      <div class="content">
        ${slide.bullets ? `
          <ul class="bullets">
            ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    </div>
  `
}

function renderBigIdeaSlide(slide: Slide, config: TemplateConfig): string {
  return `
    <div class="slide big-idea-slide">
      <div class="content">
        <div class="accent-line"></div>
        <h1 class="headline">${slide.headline || slide.content || ''}</h1>
        ${slide.content && slide.headline ? `<p style="font-size: 36px; margin-top: 40px; max-width: 70%;">${slide.content}</p>` : ''}
      </div>
    </div>
  `
}

function renderImageFocusSlide(slide: Slide, config: TemplateConfig): string {
  const images = slide.images || []
  return `
    <div class="slide">
      ${slide.headline ? `
        <div class="accent-line"></div>
        <h2 style="font-size: 48px; margin-bottom: 40px;">${slide.headline}</h2>
      ` : ''}
      <div class="image-container">
        ${images.map(img => `<img src="${img.url}" alt="${img.alt || ''}">`).join('')}
      </div>
    </div>
  `
}

function renderMoodboardSlide(slide: Slide, config: TemplateConfig): string {
  const images = slide.images || []
  return `
    <div class="slide">
      ${slide.headline ? `
        <div class="accent-line"></div>
        <h2 style="font-size: 48px; margin-bottom: 40px;">${slide.headline}</h2>
      ` : ''}
      <div class="moodboard">
        ${images.slice(0, 6).map(img => `<img src="${img.url}" alt="${img.alt || ''}">`).join('')}
      </div>
    </div>
  `
}

function renderComparisonSlide(slide: Slide, config: TemplateConfig): string {
  const comparison = slide.comparison || { before: { title: 'לפני', items: [] }, after: { title: 'אחרי', items: [] } }
  return `
    <div class="slide">
      ${slide.headline ? `
        <div class="accent-line"></div>
        <h1 class="headline" style="font-size: 56px;">${slide.headline}</h1>
      ` : ''}
      <div class="comparison">
        <div class="comparison-side comparison-before">
          <div class="comparison-title">${comparison.before.title}</div>
          <ul class="bullets">
            ${comparison.before.items.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
        <div class="comparison-side comparison-after">
          <div class="comparison-title">${comparison.after.title}</div>
          <ul class="bullets">
            ${comparison.after.items.map(item => `<li>${item}</li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `
}

function renderSummarySlide(slide: Slide, config: TemplateConfig): string {
  return `
    <div class="slide">
      <div class="accent-line"></div>
      <h1 class="headline">${slide.headline || 'סיכום'}</h1>
      <div class="content">
        ${slide.bullets ? `
          <ul class="bullets">
            ${slide.bullets.map(b => `<li>${b}</li>`).join('')}
          </ul>
        ` : ''}
        ${slide.content ? `<p style="margin-top: 40px; font-size: 36px; color: ${config.colors.accent};">${slide.content}</p>` : ''}
      </div>
    </div>
  `
}

export function renderDeckToHtml(data: DeckData, config: TemplateConfig): string[] {
  return data.deck.slides.map((slide, index) => 
    renderSlideToHtml(slide, index, data.deck.slides.length, data.deck.title, config)
  )
}





