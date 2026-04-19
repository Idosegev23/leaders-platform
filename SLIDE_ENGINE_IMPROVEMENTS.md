# מסמך שיפורים — Slide Engine v3
## מ-"OK" ל-"WOW": כל מה שצריך לשנות, קובץ קובץ

---

## תוכן עניינים

1. [סיכום בעיות ועדיפויות](#1-סיכום)
2. [typography.ts — הערכת גובה טקסט](#2-typography)
3. [collision.ts — Collision Detection חכם](#3-collision)
4. [grid.ts — RTL Mirroring](#4-grid)
5. [art-direction.ts — Content-Aware Prompt](#5-art-direction)
6. [hero-center.ts — Adaptive Title Scale](#6-hero-center)
7. [hero-left.ts — RTL-Aware Split](#7-hero-left)
8. [bento-grid.ts — Adaptive Grid + Min Sizes](#8-bento-grid)
9. [full-bleed.ts — Dynamic Image Filter](#9-full-bleed)
10. [editorial.ts — Quote Length Guard](#10-editorial)
11. [cards-float.ts — Single Card Fallback](#11-cards-float)
12. [split-screen.ts — RTL + Card Overflow](#12-split-screen)
13. [data-art.ts — Missing Number Fallback](#13-data-art)
14. [timeline-flow.ts — Phase Overflow](#14-timeline-flow)
15. [decorative/index.ts — RTL Decorative](#15-decorative)
16. [index.ts — Adaptive Pipeline](#16-index)
17. [types.ts — New Types](#17-types)
18. [elements.ts — Min Font Size](#18-elements)
19. [colors.ts — Contrast Validation](#19-colors)
20. [depth.ts — Richer Shadows](#20-depth)
21. [slide-designer.ts — Prompt Improvements](#21-slide-designer)
22. [Design System Prompt — Creative Direction](#22-design-system-prompt)
23. [Content Plan Prompt — Better Copy](#23-content-plan-prompt)

---

## 1. סיכום בעיות ועדיפויות {#1-סיכום}

### עדיפות קריטית (P0) — שוברים את המצגת
| # | בעיה | קובץ | אפקט |
|---|------|------|------|
| 1 | הערכת גובה טקסט שגויה | `typography.ts` | טקסט גולש מכל קומפוזיציה |
| 2 | אין RTL mirroring בגריד | `grid.ts` + compositions | שקופיות נראות הפוך |
| 3 | אין content-aware constraints ב-art direction | `art-direction.ts` | composition לא מתאים לתוכן |
| 4 | Collision detection חד-כיווני | `collision.ts` | אלמנטים עדיין חופפים |

### עדיפות גבוהה (P1) — גורמים למראה generic
| # | בעיה | קובץ | אפקט |
|---|------|------|------|
| 5 | אין adaptive title scale | כל ה-compositions | כותרות ארוכות גולשות |
| 6 | פילטר תמונות קבוע | `full-bleed.ts`, `editorial.ts` | תמונות כהות מדי או בהירות מדי |
| 7 | cards-float עם כרטיס בודד | `cards-float.ts` | layout שבור |
| 8 | אין min font size | `elements.ts` | טקסט בלתי קריא |

### עדיפות בינונית (P2) — מרמה טובה לרמה מעולה
| # | בעיה | קובץ | אפקט |
|---|------|------|------|
| 9 | decorative elements לא RTL-aware | `decorative/index.ts` | אלמנטים בצד הלא נכון |
| 10 | אין contrast validation | `colors.ts` | טקסט לא קריא על רקע |
| 11 | shadows לא מספיק עשירים | `depth.ts` | חוסר עומק |
| 12 | prompts לא מספיק מכוונים | `slide-designer.ts` | תוצאות AI פחות מדויקות |

---

## 2. typography.ts — הערכת גובה טקסט {#2-typography}

### הבעיה
`estimateTextHeight` משתמש ב-`0.55` כרוחב ממוצע של תו, שובר מילים באמצע, ולא מוסיף buffer. התוצאה: טקסט גולש בכל שקופית שנייה.

### הקוד הנוכחי (שורות 44-55)
```typescript
export function estimateTextHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  availableWidth: number,
): number {
  const avgCharWidth = fontSize * 0.55
  const charsPerLine = Math.max(1, Math.floor(availableWidth / avgCharWidth))
  const lines = Math.ceil(text.length / charsPerLine)
  return Math.round(lines * fontSize * lineHeight)
}
```

### הקוד החדש
```typescript
/**
 * Estimate pixel height for a text block.
 * Hebrew text in Heebo is wider than Latin — uses 0.62 avg width.
 * Word-aware: breaks at spaces, not mid-word.
 * Adds 15% safety buffer for rendering differences.
 */
export function estimateTextHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  availableWidth: number,
): number {
  if (!text || availableWidth <= 0) return fontSize * lineHeight

  // Hebrew Heebo is wider than Latin (~0.62 vs 0.55 for proportional fonts)
  const avgCharWidth = fontSize * 0.62
  const maxCharsPerLine = Math.max(1, Math.floor(availableWidth / avgCharWidth))

  // Word-aware line counting (don't break mid-word)
  const words = text.split(/\s+/)
  let lines = 1
  let currentLineChars = 0

  for (const word of words) {
    const wordLen = word.length + (currentLineChars > 0 ? 1 : 0) // +1 for space
    if (currentLineChars + wordLen > maxCharsPerLine && currentLineChars > 0) {
      lines++
      currentLineChars = word.length
    } else {
      currentLineChars += wordLen
    }
  }

  // 15% safety buffer for font rendering variance
  return Math.round(lines * fontSize * lineHeight * 1.15)
}

/**
 * Check if title text at given scale will overflow available width.
 * Returns recommended scale if overflow detected.
 */
export function getAdaptiveTitleScale(
  text: string,
  scale: TitleScale,
  ds: PremiumDesignSystem,
  availableWidth: number,
  availableHeight: number,
): TitleScale {
  const SCALE_ORDER: TitleScale[] = ['xxl', 'xl', 'lg', 'md']
  let currentScale = scale
  const scaleIdx = SCALE_ORDER.indexOf(currentScale)

  for (let i = scaleIdx; i < SCALE_ORDER.length; i++) {
    currentScale = SCALE_ORDER[i]
    const typo = getTypoScale(currentScale, ds)
    const titleH = estimateTextHeight(text, typo.titleSize, typo.titleLineHeight, availableWidth)

    // Title should use max 40% of available height
    if (titleH <= availableHeight * 0.4) {
      return currentScale
    }
  }

  return 'md' // Fallback to smallest
}
```

### למה זה חשוב
- **0.55 → 0.62**: עברית ב-Heebo רחבה יותר. הערך 0.55 מתאים לאנגלית ב-Arial
- **Word-aware**: במקום לשבור באמצע מילה, שובר רק בין מילים — כמו שדפדפן אמיתי עושה
- **Buffer 15%**: מכסה הבדלים בין חישוב שלנו לרנדור בפועל
- **`getAdaptiveTitleScale`**: חדש — אם הכותרת ב-xxl לא נכנסת, יורד ל-xl, וכן הלאה

---

## 3. collision.ts — Collision Detection חכם {#3-collision}

### הבעיה
הלולאה בודקת חפיפות מלמעלה למטה, אבל אחרי שמזיזה אלמנט B למטה, הוא עלול לחפוף עם C — והלולאה לא בודקת שוב. גם אין הגנה על overflow מהקנבס.

### הקוד הנוכחי (שורות 41-83)
Nudge חד-פעמי, אין לולאה חוזרת.

### הקוד החדש
```typescript
/**
 * Fix overlapping elements by nudging lower-priority elements down.
 * Uses iterative approach (max 3 passes) to handle cascade collisions.
 */
export function fixOverlaps(elements: SlideElement[]): SlideElement[] {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex)
  const fixed = sorted.map(el => ({ ...el }))

  const MAX_PASSES = 3
  const GAP = 16 // Slightly larger gap for visual breathing room

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let hadCollision = false

    for (let i = 0; i < fixed.length; i++) {
      const el = fixed[i]
      if (isProtected(el)) continue

      const elBox = getBox(el)

      for (let j = 0; j < i; j++) {
        const other = fixed[j]
        if (isProtected(other)) continue

        const otherBox = getBox(other)
        const area = overlapArea(elBox, otherBox)
        const minArea = Math.min(
          elBox.width * elBox.height,
          otherBox.width * otherBox.height
        )

        if (area > minArea * 0.05) {
          const newY = otherBox.y + otherBox.height + GAP
          el.y = newY
          elBox.y = newY
          hadCollision = true
        }
      }

      // Canvas bounds enforcement
      if (el.y + el.height > CANVAS_HEIGHT - 40) {
        // Try to shrink first, then move
        const overflow = (el.y + el.height) - (CANVAS_HEIGHT - 40)
        if (el.height - overflow >= 40) {
          el.height = el.height - overflow
        } else {
          // Element is too large — clamp position and height
          el.y = Math.min(el.y, CANVAS_HEIGHT - 80)
          el.height = Math.max(40, CANVAS_HEIGHT - 40 - el.y)
        }
      }
    }

    // If no collisions found, no need for more passes
    if (!hadCollision) break
  }

  return fixed
}

/** Protected elements: backgrounds, decoratives, and low-z elements */
function isProtected(el: SlideElement): boolean {
  if (el.zIndex <= 3) return true
  if (el.type === 'shape') {
    const st = (el as { shapeType?: string }).shapeType
    if (st === 'background' || st === 'decorative') return true
  }
  if (el.type === 'text' && (el as { role?: string }).role === 'decorative') return true
  return false
}
```

### למה זה חשוב
- **3 passes**: מגלה cascade collisions (A מזיז B שחופף C)
- **GAP 16px**: רווח נשימה גדול יותר (במקום 12px)
- **Canvas bounds חכם**: קודם מנסה לכווץ, אחר כך מזיז — אלמנט לא "נעלם"
- **`isProtected` function**: קוד נקי יותר, קל להוסיף חריגים

---

## 4. grid.ts — RTL Mirroring {#4-grid}

### הבעיה
כל ה-compositions משתמשים ב-`grid.col(1, 7)` שמתחיל משמאל. ב-RTL, הטקסט הראשי צריך להיות *מימין*. כרגע `hero-left` שם טקסט בשמאל — מה שנראה הפוך בעברית.

### הקוד החדש — הוספה ל-grid.ts
```typescript
export function createGrid(overrides?: Partial<GridConfig>): Grid {
  const cfg = { ...DEFAULT_CONFIG, ...overrides }
  const direction = cfg.direction || 'rtl' // Default RTL for Hebrew

  // ... existing code ...

  return {
    usable,

    col(start: number, span: number) {
      const s = Math.max(1, Math.min(start, cfg.columns)) - 1
      const guttersSpanned = Math.max(0, span - 1)
      const x = usableX + s * (colWidth + cfg.gutter)
      const width = span * colWidth + guttersSpanned * cfg.gutter
      return { x: Math.round(x), width: Math.round(width) }
    },

    /**
     * RTL-aware column positioning.
     * In RTL: col 1 starts from RIGHT edge.
     * colRTL(1, 7) = rightmost 7 columns
     */
    colRTL(start: number, span: number) {
      if (direction === 'ltr') return this.col(start, span)
      // Mirror: col 1 from right = col (13 - span) from left
      const mirroredStart = cfg.columns - start - span + 2
      return this.col(mirroredStart, span)
    },

    // ... rest of existing methods ...
  }
}
```

### שינויים ב-GridConfig
```typescript
export interface GridConfig {
  columns: number
  gutter: number
  margin: number
  canvasWidth: number
  canvasHeight: number
  direction?: 'rtl' | 'ltr' // NEW
}
```

### איך להשתמש ב-compositions
במקום:
```typescript
// hero-left.ts — BEFORE
const textCols = side === 'left' ? grid.col(1, 7) : grid.col(6, 7)
const imgCols = side === 'left' ? grid.col(9, 4) : grid.col(1, 4)
```

צריך:
```typescript
// hero-left.ts — AFTER (RTL-aware)
// In RTL "hero-left" means text on RIGHT (reading start), image on LEFT
const textCols = side === 'left' ? grid.colRTL(1, 7) : grid.colRTL(6, 7)
const imgCols = side === 'left' ? grid.colRTL(9, 4) : grid.colRTL(1, 4)
```

### חשוב: לא לשנות textAlign
ה-`textAlign: 'right'` כבר נכון — זה לא משתנה. מה שמשתנה הוא רק ה-X position של כל element.

---

## 5. art-direction.ts — Content-Aware Prompt {#5-art-direction}

### הבעיה
הפרומפט נותן ל-AI מידע על type ו-image/cards/bullets count, אבל לא על אורך הכותרת, אם יש keyNumber, או אם יש מספיק תוכן ל-composition הנבחר. התוצאה: AI בוחר `editorial` לשקופית עם 3 מילים, או `data-art` בלי מספר.

### שינוי 1: buildArtDirectionPrompt — הוספת content metadata
```typescript
export function buildArtDirectionPrompt(
  plans: SlidePlan[],
  ds: PremiumDesignSystem,
  brandName: string,
): string {
  const slideList = plans.map((p, i) => {
    const hasImage = !!p.existingImageKey
    const hasCards = (p.cards?.length || 0) > 0
    const hasBullets = (p.bulletPoints?.length || 0) > 0
    const hasNumber = !!p.keyNumber
    const hasBody = !!p.bodyText && p.bodyText.length > 10

    // NEW: Title length classification
    const titleLen = p.title.length
    const titleClass = titleLen <= 15 ? 'short' : titleLen <= 35 ? 'medium' : 'long'

    // NEW: Content richness
    const contentItems = (p.cards?.length || 0) + (p.bulletPoints?.length || 0)

    return `  ${i + 1}. type="${p.slideType}" title="${p.title}" titleLength=${titleClass}(${titleLen}chars) image=${hasImage} cards=${hasCards ? p.cards!.length : 0} bullets=${hasBullets ? p.bulletPoints!.length : 0} number=${hasNumber ? `"${p.keyNumber}"` : 'none'} hasBody=${hasBody} contentItems=${contentItems} tone="${p.emotionalTone}"`
  }).join('\n')

  // ... existing metaphor/tension code ...

  return `You are an art director designing a ${plans.length}-slide presentation for "${brandName}".

Visual direction: ${metaphor}. Tension: ${tension}.

For each slide, choose the BEST visual approach. Do NOT generate pixel positions — just make creative decisions.

SLIDES:
${slideList}

COMPOSITIONS available:
- hero-center: dominant central element (covers, big ideas, closings)
- hero-left / hero-right: 60/40 split with hero on one side (briefs, audience)
- split-screen: 55/45 with divider (strategy, competitive)
- bento-grid: asymmetric card grid (goals, deliverables, influencers)
- data-art: oversized numbers (metrics, whyNow)
- editorial: large quote, magazine style (insight) — REQUIRES bodyText ≥ 15 words
- cards-float: layered cards with depth (approach, content strategy) — REQUIRES ≥ 2 cards/bullets
- full-bleed: full image with text overlay — REQUIRES image=true
- timeline-flow: horizontal phases (timeline) — REQUIRES ≥ 3 cards/bullets

CONTENT CONSTRAINTS (CRITICAL — violating these produces broken slides):
- editorial: ONLY if hasBody=true AND bodyText is long enough for a quote
- data-art: ONLY if number is present
- full-bleed: ONLY if image=true
- cards-float: ONLY if cards ≥ 2 OR bullets ≥ 2
- bento-grid: ONLY if cards ≥ 2 OR bullets ≥ 2
- timeline-flow: ONLY if cards ≥ 3 OR bullets ≥ 3
- If none of the above match, use hero-center or hero-left

TITLE SCALE RULES:
- titleLength=short → titleScale can be xxl or xl (big dramatic text)
- titleLength=medium → titleScale should be lg or xl
- titleLength=long → titleScale MUST be md or lg (prevent overflow!)
- cover + closing → always xxl or xl regardless of length

VARIETY RULES:
1. Never same composition on consecutive slides
2. Use all 3 title zones (top/center/bottom) — never all the same
3. At least 2 slides xl or xxl
4. At least half gradient backgrounds
5. Vary decorative elements
6. cover → hero-center or full-bleed, titleScale xxl
7. closing → hero-center, titleScale xl or xxl`
}
```

### שינוי 2: sanitizeDirection — Content validation
```typescript
function sanitizeDirection(raw: Record<string, unknown>, plan: SlidePlan): SlideDirection {
  let composition = validateEnum(raw.composition, VALID_COMPOSITIONS, getDefaultComposition(plan.slideType))

  // Content-aware composition override
  const hasCards = (plan.cards?.length || 0) >= 2
  const hasBullets = (plan.bulletPoints?.length || 0) >= 2
  const hasNumber = !!plan.keyNumber
  const hasImage = !!plan.existingImageKey
  const hasBody = !!plan.bodyText && plan.bodyText.length > 30

  // Prevent broken compositions
  if (composition === 'editorial' && !hasBody) composition = 'hero-center'
  if (composition === 'data-art' && !hasNumber) composition = hasCards ? 'bento-grid' : 'hero-center'
  if (composition === 'full-bleed' && !hasImage) composition = 'hero-center'
  if (composition === 'cards-float' && !hasCards && !hasBullets) composition = 'hero-center'
  if (composition === 'bento-grid' && !hasCards && !hasBullets) composition = 'hero-left'
  if (composition === 'timeline-flow' && !hasCards && !hasBullets) composition = 'hero-center'

  // Title scale based on length
  let titleScale = validateEnum(raw.titleScale, VALID_SCALES, 'lg')
  const titleLen = plan.title.length
  if (titleLen > 35 && (titleScale === 'xxl' || titleScale === 'xl')) {
    titleScale = 'lg' // Prevent long title overflow
  }
  if (titleLen > 50) {
    titleScale = 'md'
  }

  return {
    slideType: plan.slideType,
    composition,
    heroElement: validateEnum(raw.heroElement, VALID_HEROES, hasNumber ? 'number' : hasImage ? 'image' : 'title'),
    titlePlacement: validateEnum(raw.titlePlacement, VALID_PLACEMENTS, 'top'),
    titleScale,
    backgroundStyle: validateEnum(raw.backgroundStyle, VALID_BG, hasImage ? 'image-overlay' : 'gradient'),
    gradientAngle: typeof raw.gradientAngle === 'number' ? raw.gradientAngle : 135,
    decorativeElement: validateEnum(raw.decorativeElement, VALID_DECO, 'none'),
    colorEmphasis: validateEnum(raw.colorEmphasis, VALID_EMPHASIS, 'dark'),
    dramaticChoice: typeof raw.dramaticChoice === 'string' ? raw.dramaticChoice : 'Bold typography',
  }
}
```

### למה זה חשוב
- **AI יודע כמה ארוכה הכותרת** — לא בוחר xxl לכותרת של 50 תווים
- **Content constraints** — AI לא יכול לבחור editorial בלי bodyText
- **Validation layer** — גם אם AI טעה, ה-sanitize מתקן

---

## 6. hero-center.ts — Adaptive Title Scale {#6-hero-center}

### הבעיה
כותרת xxl (196px) עם 40+ תווים גולשת. ה-watermark הענק חופף עם הכותרת.

### שינויים מרכזיים

```typescript
export const heroCenterLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []

  // ... background code stays same ...

  const { y: zoneY } = grid.zone(direction.titlePlacement)
  const titleWidth = grid.col(1, 10).width
  const titleX = grid.col(2, 10).x

  // NEW: Adaptive title — check if it fits, downscale if needed
  const adaptedScale = getAdaptiveTitleScale(
    content.title, direction.titleScale, ds,
    titleWidth, grid.usable.height * 0.4
  )
  const adaptedTypo = adaptedScale !== direction.titleScale
    ? getTypoScale(adaptedScale, ds)
    : typo

  // Watermark — only when title is ≤ 2 words and scale is xl+
  const titleWords = content.title.split(/\s+/)
  const watermarkWord = titleWords[0] || content.title
  if (adaptedTypo.titleSize >= 100 && titleWords.length <= 3) {
    // ... existing watermark code, using watermarkWord ...
  }

  // Hero title — use adapted typography
  const titleH = estimateTextHeight(
    content.title, adaptedTypo.titleSize, adaptedTypo.titleLineHeight, titleWidth
  )
  elements.push(text({
    content: content.title,
    rect: {
      x: titleX,
      y: zoneY + 20,
      width: titleWidth,
      height: Math.max(titleH, adaptedTypo.titleLineHeightPx)
    },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textAlign: 'center',
    lineHeight: adaptedTypo.titleLineHeight,
    letterSpacing: adaptedTypo.titleSize >= 80 ? -4 : -1,
    textShadow: `0 6px 40px rgba(0,0,0,0.6), 0 0 80px ${withAlpha(ds.colors.accent, 0.2)}`,
  }))

  // ... rest of the layout uses adaptedTypo instead of typo ...
}
```

### חוק כללי לכל ה-compositions
כל composition שמקבל `typo` צריך לעשות adaptive check בהתחלה:
```typescript
const adaptedTypo = getAdaptiveTitleScale(content.title, direction.titleScale, ds, availableWidth, availableHeight) !== direction.titleScale
  ? getTypoScale(getAdaptiveTitleScale(...), ds)
  : typo
```

---

## 7. hero-left.ts — RTL-Aware Split {#7-hero-left}

### הבעיה
`hero-left` שם טקסט בעמודות 1-7 (שמאל) ותמונה בעמודות 9-12 (ימין). ב-RTL, הטקסט הראשי צריך להיות *מימין* — כי שם העין מתחילה לקרוא.

### הקוד החדש
```typescript
function heroSplitLayout(
  content: SlideContent,
  direction: SlideDirection,
  ds: PremiumDesignSystem,
  grid: Grid,
  typo: TypoScale,
  side: 'left' | 'right',
) {
  resetIds()
  const elements: SlideElement[] = []

  const background = buildBackground(
    direction.backgroundStyle, direction.colorEmphasis, ds, direction.gradientAngle,
  )

  // RTL-aware split: in RTL, "hero-left" means text on RIGHT (reading start)
  // text side = 7 cols on the READING-START side
  // image side = 4 cols on the opposite side
  const isRTL = ds.direction === 'rtl'

  let textCols, imgCols
  if (side === 'left') {
    // "hero-left" in RTL: text RIGHT, image LEFT
    textCols = isRTL ? grid.col(5, 8) : grid.col(1, 7)
    imgCols = isRTL ? grid.col(1, 4) : grid.col(9, 4)
  } else {
    // "hero-right" in RTL: text LEFT, image RIGHT
    textCols = isRTL ? grid.col(1, 7) : grid.col(6, 7)
    imgCols = isRTL ? grid.col(9, 4) : grid.col(1, 4)
  }

  // NEW: Adaptive title
  const adaptedScale = getAdaptiveTitleScale(
    content.title, direction.titleScale, ds,
    textCols.width, grid.usable.height * 0.35
  )
  const adaptedTypo = adaptedScale !== direction.titleScale
    ? getTypoScale(adaptedScale, ds)
    : typo

  // ... rest of layout using adaptedTypo and new textCols/imgCols ...
}
```

### למה זה חשוב
ב-RTL, "hero-left" צריך לשים את הטקסט *מימין* כי שם הקריאה מתחילה. בלי זה, כל שקופית brief/audience נראית "הפוך" לעין עברית.

---

## 8. bento-grid.ts — Adaptive Grid + Min Sizes {#8-bento-grid}

### הבעיות
1. כותרת xxl + 6 כרטיסים = כרטיסים מקבלים 100px, טקסט נחתך
2. אין גובה מינימלי לכרטיס
3. Card padding קשיח — לא מותאם לגודל הכרטיס

### שינויים מרכזיים
```typescript
export const bentoGridLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground(...)
  const gap = ds.spacing.cardGap || 24

  // Determine items
  const items: { title: string; body: string }[] = []
  if (content.cards?.length) items.push(...content.cards)
  else if (content.bulletPoints?.length) items.push(...content.bulletPoints.map((b, i) => ({ title: `${i + 1}`, body: b })))
  if (items.length === 0 && content.bodyText) items.push({ title: content.title, body: content.bodyText })

  const count = Math.min(items.length, 6)

  // NEW: Adaptive title — smaller title if many cards
  const titleScaleOverride = count >= 5 ? 'md' : count >= 3 ? 'lg' : direction.titleScale
  const adaptedTypo = titleScaleOverride !== direction.titleScale
    ? getTypoScale(titleScaleOverride as TitleScale, ds)
    : typo

  // Title at top
  const titleZone = grid.zone('top')
  elements.push(text({
    content: content.title,
    rect: { x: grid.usable.x, y: titleZone.y + 10, width: grid.usable.width, height: adaptedTypo.titleLineHeightPx + 10 },
    fontSize: adaptedTypo.titleSize,
    fontWeight: adaptedTypo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    textShadow: titleShadow(),
  }))

  let gridStartY = titleZone.y + adaptedTypo.titleLineHeightPx + 30
  // ... subtitle code ...

  const gridH = grid.usable.y + grid.usable.height - gridStartY - 20

  // NEW: Minimum card height check
  const MIN_CARD_HEIGHT = 120
  const cells = getBentoCells(count, grid.usable.x, gridStartY, grid.usable.width, gridH, gap)

  // Check if any cell is too small
  const minCellH = Math.min(...cells.map(c => c.height))
  if (minCellH < MIN_CARD_HEIGHT && count > 4) {
    // Reduce to max 4 items — better fewer readable cards than many tiny ones
    const reducedCells = getBentoCells(4, grid.usable.x, gridStartY, grid.usable.width, gridH, gap)
    // Use reduced cells and items.slice(0, 4)
  }

  // NEW: Adaptive padding — smaller cards get smaller padding
  for (let i = 0; i < count; i++) {
    const cell = cells[i]
    const item = items[i]
    const isFirst = i === 0
    const pad = cell.height < 160 ? 16 : cell.height < 220 ? 24 : ds.spacing.cardPadding || 32

    // Card title — smaller font if card is small
    const cardTitleSize = cell.height < 160
      ? typo.bodySize
      : isFirst ? typo.subtitleSize + 4 : typo.bodySize + 2

    // Card body — only show if there's enough room
    const bodyStartY = cell.y + pad + cardTitleSize + 12
    const bodyAvailH = cell.height - pad * 2 - cardTitleSize - 12
    const showBody = bodyAvailH >= 30 && item.body

    // ... element creation with adaptive sizes ...
  }

  return { background, elements }
}
```

---

## 9. full-bleed.ts — Dynamic Image Filter {#9-full-bleed}

### הבעיה
`filter: 'brightness(0.65) contrast(1.1)'` קבוע. תמונה כהה → שחורה. תמונה בהירה → עדיין בהירה מדי.

### הקוד החדש
```typescript
export const fullBleedLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  resetIds()
  const elements = []
  const background = buildBackground('solid', 'dark', ds)

  if (content.imageUrl) {
    elements.push(image({
      src: content.imageUrl,
      rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
      zIndex: Z.BACKGROUND,
      // NEW: brightness varies by titlePlacement
      // Top title needs darker top, bottom title needs darker bottom
      filter: 'brightness(0.55) contrast(1.15) saturate(1.1)',
    }))
  }

  // NEW: Stronger, directional gradient overlay
  const gradDir = direction.titlePlacement === 'top' ? '180deg'
    : direction.titlePlacement === 'bottom' ? '0deg'
    : '180deg'

  elements.push(shape({
    rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    // NEW: Much stronger gradient at text zone (e8 instead of e0)
    fill: `linear-gradient(${gradDir}, ${ds.colors.background}e8 0%, ${ds.colors.background}80 40%, ${ds.colors.background}20 70%, transparent 100%)`,
    shapeType: 'background',
    zIndex: Z.GRADIENT_OVERLAY,
  }))

  // NEW: Second gradient for extra text protection (scrim)
  elements.push(shape({
    rect: { x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    fill: `linear-gradient(${gradDir}, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)`,
    shapeType: 'background',
    zIndex: Z.GRADIENT_OVERLAY,
  }))

  // ... rest of text layout (unchanged) ...
}
```

### עקרון
- **brightness 0.55** (במקום 0.65) — כהה יותר כבסיס
- **saturate 1.1** — שומר על צבעים חיים אחרי ה-darken
- **Double gradient** — scrim layer נוסף שמגן על הטקסט
- **e8 opacity** (במקום e0) — מוודא שטקסט לבן תמיד קריא

---

## 10. editorial.ts — Quote Length Guard {#10-editorial}

### הבעיה
אם `bodyText` קצר (5 מילים), ה-quote נראה מוזר בגודל ענק. אם אין bodyText בכלל, הכותרת הופכת ל-quote מה שלא תמיד מתאים.

### שינוי מרכזי
```typescript
export const editorialLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  // ...

  // Decide what's the quote and what's the attribution
  const quoteText = content.bodyText || content.title

  // NEW: Guard — if quote is too short, reduce scale
  const quoteWords = quoteText.split(/\s+/).length
  const quoteScale = quoteWords < 5 ? 0.7  // Very short — smaller for elegance
    : quoteWords < 10 ? 0.85               // Medium — slightly smaller
    : 1.0                                    // Long — full size

  const quoteSize = Math.round(
    (direction.heroElement === 'quote' ? typo.titleSize : typo.titleSize * 0.85) * quoteScale
  )

  // NEW: If quote is very short (< 5 words), add extra whitespace by centering
  const quoteAlignment = quoteWords < 8 ? 'center' : 'right'

  elements.push(text({
    content: quoteText,
    rect: { x: quoteX, y: zoneY, width: quoteWidth, height: Math.max(quoteH, quoteSize + 20) },
    fontSize: quoteSize,
    fontWeight: typo.titleWeight,
    color: textColor(ds),
    role: 'title',
    zIndex: Z.HERO,
    lineHeight: 1.3,
    letterSpacing: -1,
    textShadow: titleShadow(),
    textAlign: quoteAlignment, // NEW: center for short quotes
  }))

  // ...
}
```

---

## 11. cards-float.ts — Single Card Fallback {#11-cards-float}

### הבעיה
כשיש כרטיס אחד, `overlapOffset` הופך לכל הגובה הפנוי, הכרטיס יושב למעלה עם חלל ענק.

### הקוד החדש
```typescript
export const cardsFloatLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  // ...

  const items = content.cards?.length
    ? content.cards
    : (content.bulletPoints?.map((b, i) => ({ title: `שלב ${i + 1}`, body: b })) || [])

  if (items && items.length > 0) {
    const count = Math.min(items.length, 5)

    // NEW: Single card — center it instead of floating
    if (count === 1) {
      const card = items[0]
      const cardW = grid.col(2, 10).width // Wider single card
      const cardH = Math.min(280, grid.usable.height - startY - 40)
      const cx = grid.col(2, 10).x
      const cy = Math.round(startY + (grid.usable.y + grid.usable.height - startY - cardH) / 2)
      const pad = ds.spacing.cardPadding || 32
      const radius = getBorderRadius(ds, 'lg') // Larger radius for single card

      elements.push(shape({
        rect: { x: cx, y: cy, width: cardW, height: cardH },
        fill: withAlpha(ds.colors.accent, 0.08),
        shapeType: 'rectangle',
        zIndex: Z.CARD,
        borderRadius: radius,
        border: `1px solid ${withAlpha(ds.colors.accent, 0.2)}`,
        boxShadow: getShadow(ds.effects.shadowStyle, 'heavy') || '0 12px 40px rgba(0,0,0,0.25)',
      }))

      elements.push(text({
        content: card.title,
        rect: { x: cx + pad, y: cy + pad, width: cardW - pad * 2, height: 40 },
        fontSize: typo.subtitleSize + 4,
        fontWeight: 700,
        color: accentColor(ds),
        role: 'label',
        zIndex: Z.CONTENT,
      }))

      if (card.body) {
        elements.push(text({
          content: card.body,
          rect: { x: cx + pad, y: cy + pad + 52, width: cardW - pad * 2, height: cardH - pad * 2 - 52 },
          fontSize: typo.bodySize,
          fontWeight: typo.bodyWeight,
          color: mutedColor(ds),
          role: 'body',
          zIndex: Z.CONTENT,
          lineHeight: 1.6,
        }))
      }

      return { background, elements }
    }

    // NEW: Two cards — side by side instead of floating
    if (count === 2) {
      // Side by side layout instead of overlapping
      const totalW = grid.col(1, 12).width
      const cardW = (totalW - gap) / 2
      const cardH = Math.min(280, grid.usable.height - startY - 40)
      // ... side by side implementation ...
    }

    // 3+ cards — existing floating logic
    // ... existing cards-float code for count >= 3 ...
  }

  return { background, elements }
}
```

---

## 12. split-screen.ts — RTL + Card Overflow {#12-split-screen}

### הבעיה
1. בצד שמאל יש טקסט ובצד ימין כרטיסים — הפוך ב-RTL
2. אם יש 5+ כרטיסים, הם נחתכים

### שינויים מרכזיים
```typescript
export const splitScreenLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  // ...

  // NEW: RTL-aware split
  const isRTL = ds.direction === 'rtl'
  const dividerX = Math.round(grid.usable.x + grid.usable.width * 0.55)

  // In RTL: text on RIGHT (55%), cards on LEFT (45%)
  const textX = isRTL ? dividerX + 40 : grid.usable.x
  const textW = isRTL
    ? (grid.usable.x + grid.usable.width) - dividerX - 40
    : dividerX - grid.usable.x - 40
  const cardX = isRTL ? grid.usable.x : dividerX + 40
  const cardW = isRTL
    ? dividerX - grid.usable.x - 40
    : grid.usable.x + grid.usable.width - dividerX - 40

  // ... text elements use textX, textW ...
  // ... card elements use cardX, cardW ...

  // NEW: Card overflow protection
  if (content.cards?.length) {
    const count = Math.min(content.cards.length, 5) // Hard max 5
    const cardH = (grid.usable.height - 60 - (count - 1) * gap) / count
    const MIN_CARD_H = 100

    // If cards too small, reduce count
    const actualCount = cardH < MIN_CARD_H
      ? Math.floor((grid.usable.height - 60 + gap) / (MIN_CARD_H + gap))
      : count

    // ... use actualCount instead of count ...
  }
}
```

---

## 13. data-art.ts — Missing Number Fallback {#13-data-art}

### הבעיה
אם art-direction בוחר `data-art` אבל אין `keyNumber`, השקופית ריקה למעלה.

### שינוי
```typescript
export const dataArtLayout: CompositionFn = (content, direction, ds, grid, typo) => {
  // ...

  // NEW: If no keyNumber, use first card number or title as hero element
  const heroNumber = content.keyNumber
    || (content.cards?.[0]?.title?.match(/\d/) ? content.cards[0].title : null)

  if (heroNumber) {
    // ... existing hero number layout ...
  } else {
    // NEW: Fallback — large title in hero zone instead of number
    const titleSize = Math.min(typo.titleSize * 1.5, 120)
    elements.push(text({
      content: content.title,
      rect: { x: grid.usable.x, y: grid.usable.y + typo.titleLineHeightPx + 40, width: grid.usable.width, height: titleSize + 20 },
      fontSize: titleSize,
      fontWeight: 800,
      color: accentColor(ds),
      role: 'title',
      zIndex: Z.HERO,
      letterSpacing: -3,
      textShadow: `0 4px 30px ${withAlpha(ds.colors.accent, 0.3)}`,
    }))
  }

  // ...
}
```

---

## 14. timeline-flow.ts — Phase Overflow {#14-timeline-flow}

### הבעיה
6 phases על רוחב 1760px = כל phase ~280px. עם padding 24px וטקסט, זה צפוף מאוד.

### שינוי
```typescript
// NEW: Max 5 phases (6 is too cramped on 1920px)
const count = Math.min(phases.length, 5)

// NEW: Minimum phase width
const MIN_PHASE_W = 260
const maxPhases = Math.floor((grid.usable.width + gap) / (MIN_PHASE_W + gap))
const actualCount = Math.min(count, maxPhases)

// NEW: Adaptive text size for phases
const phaseTitleSize = actualCount >= 5 ? typo.captionSize + 2 : typo.bodySize
const phaseBodySize = actualCount >= 5 ? typo.captionSize : typo.captionSize + 1
```

---

## 15. decorative/index.ts — RTL Decorative {#15-decorative}

### הבעיה
Accent line תמיד בפינה שמאלית-עליונה, watermark תמיד מימין. ב-RTL, accent צריך להיות מימין.

### שינויים
```typescript
function accentLine(ds: PremiumDesignSystem): SlideElement[] {
  const isRTL = ds.direction === 'rtl'
  const x = isRTL ? CANVAS_WIDTH - 6 : 0    // Right corner for RTL
  const lineX = isRTL ? CANVAS_WIDTH - 120 : 0

  return [
    shape({
      rect: { x, y: 0, width: 6, height: 200 },
      fill: ds.colors.accent,
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      opacity: 0.6,
    }),
    shape({
      rect: { x: lineX, y: 0, width: 120, height: 6 },
      fill: ds.colors.accent,
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      opacity: 0.6,
    }),
  ]
}

function floatingShape(ds: PremiumDesignSystem): SlideElement[] {
  const isRTL = ds.direction === 'rtl'
  const style = ds.effects.decorativeStyle || 'geometric'

  // RTL: float to top-LEFT (opposite reading start)
  const shapeX = isRTL ? -100 : CANVAS_WIDTH - 300

  if (style === 'organic' || style === 'minimal') {
    return [
      shape({
        rect: { x: shapeX, y: -100, width: 400, height: 400 },
        fill: withAlpha(ds.colors.accent, 0.08),
        shapeType: 'circle',
        zIndex: Z.DECORATIVE,
        borderRadius: 200,
      }),
    ]
  }

  return [
    shape({
      rect: { x: shapeX, y: -80, width: 250, height: 250 },
      fill: withAlpha(ds.colors.primary, 0.06),
      shapeType: 'decorative',
      zIndex: Z.DECORATIVE,
      rotation: 45,
      borderRadius: ds.effects.borderRadiusValue || 12,
    }),
  ]
}
```

---

## 16. index.ts — Adaptive Pipeline {#16-index}

### שינוי מרכזי — הוספת adaptive scale ב-pipeline
```typescript
import { getTypoScale, getAdaptiveTitleScale } from './core/typography'

function layoutSingleSlide(
  content: SlideContent,
  direction: SlideDirection,
  ds: PremiumDesignSystem,
  brandName: string,
  index: number,
): Slide {
  const grid = createGrid({
    margin: ds.spacing.safeMargin || 80,
    gutter: ds.spacing.cardGap || 24,
    direction: ds.direction || 'rtl', // NEW: pass direction to grid
  })

  // NEW: Adaptive title scale before composition
  const adaptedScale = getAdaptiveTitleScale(
    content.title,
    direction.titleScale,
    ds,
    grid.usable.width,
    grid.usable.height,
  )
  const typo = getTypoScale(adaptedScale, ds)

  // Log if we had to adapt
  if (adaptedScale !== direction.titleScale) {
    console.log(`[LayoutEngine] Slide ${index}: adapted title scale ${direction.titleScale} → ${adaptedScale} for "${content.title.slice(0, 30)}..."`)
  }

  const compositionFn = getComposition(direction.composition)
  const { background, elements } = compositionFn(content, direction, ds, grid, typo)

  const decorativeElements = addDecorative(direction.decorativeElement, ds, brandName)
  const allElements = fixOverlaps([...elements, ...decorativeElements])

  return {
    id: `slide-${index}`,
    slideType: content.slideType,
    label: content.title.slice(0, 30),
    archetype: direction.composition,
    dramaticChoice: direction.dramaticChoice,
    background,
    elements: allElements,
  }
}
```

---

## 17. types.ts — New Types {#17-types}

### הוספות ל-GridConfig
```typescript
export interface GridConfig {
  columns: number
  gutter: number
  margin: number
  canvasWidth: number
  canvasHeight: number
  direction?: 'rtl' | 'ltr' // NEW
}
```

### הוספה ל-Grid interface
```typescript
export interface Grid {
  col(start: number, span: number): { x: number; width: number }
  colRTL(start: number, span: number): { x: number; width: number } // NEW
  zone(placement: TitlePlacement): { y: number; height: number }
  centerY(blockHeight: number): number
  usable: Rect
  bentoCell(...): Rect
}
```

---

## 18. elements.ts — Min Font Size {#18-elements}

### שינוי ב-text()
```typescript
export function text(opts: TextOpts): TextElement {
  // NEW: Enforce minimum readable font size
  const MIN_FONT_SIZE = 12
  const fontSize = Math.max(opts.fontSize, MIN_FONT_SIZE)

  return {
    id: nextId('txt'),
    type: 'text',
    x: opts.rect.x,
    y: opts.rect.y,
    width: opts.rect.width,
    height: opts.rect.height,
    content: opts.content,
    fontSize, // Uses enforced minimum
    fontWeight: opts.fontWeight,
    color: opts.color,
    textAlign: opts.textAlign || 'right',
    role: opts.role,
    zIndex: opts.zIndex,
    // ... rest unchanged ...
  }
}
```

---

## 19. colors.ts — Contrast Validation {#19-colors}

### הוספה — WCAG contrast check
```typescript
/**
 * Check if text color has sufficient contrast against background.
 * Returns the better option: original color or fallback.
 * Simplified WCAG AA check (4.5:1 ratio for normal text).
 */
export function ensureContrast(
  textHex: string,
  bgHex: string,
  fallbackLight: string = '#FFFFFF',
  fallbackDark: string = '#1A1A1A',
): string {
  const textLum = relativeLuminance(textHex)
  const bgLum = relativeLuminance(bgHex)

  const ratio = (Math.max(textLum, bgLum) + 0.05) / (Math.min(textLum, bgLum) + 0.05)

  if (ratio >= 4.5) return textHex // Sufficient contrast

  // Choose better fallback
  const lightRatio = (Math.max(relativeLuminance(fallbackLight), bgLum) + 0.05) / (Math.min(relativeLuminance(fallbackLight), bgLum) + 0.05)
  const darkRatio = (Math.max(relativeLuminance(fallbackDark), bgLum) + 0.05) / (Math.min(relativeLuminance(fallbackDark), bgLum) + 0.05)

  return lightRatio > darkRatio ? fallbackLight : fallbackDark
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}
```

---

## 20. depth.ts — Richer Shadows {#20-depth}

### שינוי — Multi-layer shadows
```typescript
export function getShadow(
  style: PremiumDesignSystem['effects']['shadowStyle'],
  intensity: 'light' | 'medium' | 'heavy' = 'medium'
): string | undefined {
  if (style === 'none') return undefined

  if (style === 'fake-3d') {
    switch (intensity) {
      // NEW: Multi-layer for more realistic depth
      case 'light': return '4px 4px 0px rgba(0,0,0,0.15), 2px 2px 8px rgba(0,0,0,0.1)'
      case 'medium': return '8px 8px 0px rgba(0,0,0,0.2), 4px 4px 16px rgba(0,0,0,0.12)'
      case 'heavy': return '12px 12px 0px rgba(0,0,0,0.25), 6px 6px 24px rgba(0,0,0,0.15), 0 0 60px rgba(0,0,0,0.08)'
    }
  }

  if (style === 'glow') {
    switch (intensity) {
      case 'light': return '0 0 20px rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.2)'
      case 'medium': return '0 0 40px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.25)'
      case 'heavy': return '0 0 60px rgba(255,255,255,0.15), 0 12px 40px rgba(0,0,0,0.3), 0 0 100px rgba(255,255,255,0.05)'
    }
  }

  // NEW: Default — soft elevation shadow (not undefined)
  switch (intensity) {
    case 'light': return '0 2px 8px rgba(0,0,0,0.12)'
    case 'medium': return '0 4px 16px rgba(0,0,0,0.18)'
    case 'heavy': return '0 8px 32px rgba(0,0,0,0.25)'
  }
}
```

---

## 21. slide-designer.ts — Prompt Improvements {#21-slide-designer}

### שינוי 1: Art Direction system prompt (שורה 1067)
**BEFORE:**
```
'You are a senior art director for premium brand presentations. Choose the best visual approach for each slide.'
```

**AFTER:**
```
'You are a senior art director at a top Israeli agency creating premium RTL Hebrew presentations. Your job: make each slide feel like a different page in a luxury brand lookbook. Never repeat the same visual approach. Think Wieden+Kennedy meets Israeli tech — bold, unexpected, but always readable.'
```

### שינוי 2: ThinkingLevel for art direction (שורה 1071)
**BEFORE:**
```
thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
```

**AFTER:**
```
thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
```

**Why:** Art direction is a creative task. LOW thinking produces safe/generic choices. MEDIUM gives the AI room to make bolder decisions. The token cost increase is minimal (~500 extra tokens) because the output is small JSON.

### שינוי 3: maxOutputTokens for art direction (שורה 1072)
**BEFORE:** `4096`
**AFTER:** `6144`

**Why:** With MEDIUM thinking, the model needs more budget for its internal reasoning before outputting the structured JSON.

---

## 22. Design System Prompt — Creative Direction {#22-design-system-prompt}

### הוספה לפרומפט של שלב 1 (generateDesignSystem)
הוסף את הבלוק הבא אחרי `<creative_direction_spec>`:

```
<premium_quality_rules>
CRITICAL RULES FOR AGENCY-LEVEL DESIGN:

1. BACKGROUND COLOR: Never pure black (#000000). Always a tinted dark:
   - #0A0A12 (blue-black), #120A0A (warm-black), #0F0E17 (purple-black)
   - The tint should relate to the brand's primary color

2. CONTRAST: text color MUST pass WCAG AA (4.5:1 ratio) against background.
   - If background is dark (#0-#3 range), text should be #E0+ or white
   - If background is light (#C+ range), text should be #2- or black

3. AURORA GRADIENT: Must use 3 distinct colors at low opacity (20-40%).
   Each aurora color should be a variation of the brand palette, not random.

4. CARD BACKGROUNDS: Must be VISUALLY DISTINCT from slide background.
   - At least 10% luminosity difference
   - cardBorder should be subtle (10-20% opacity) not invisible

5. ACCENT COLOR: Must be vibrant enough to stand out on both dark and light backgrounds.
   - Saturation > 60% in HSL
   - Not too similar to primary (at least 30° hue difference unless intentional)
</premium_quality_rules>
```

---

## 23. Content Plan Prompt — Better Copy {#23-content-plan-prompt}

### שינוי בפרומפט של שלב 2 (generateSlidePlan)
הוסף את הכללים הבאים ל-`<task>`:

```
18. אורך כותרות: כותרת cover/closing מקסימום 6 מילים! כותרות אחרות מקסימום 8 מילים.
    דוגמה טובה: "3 סיבות לבחור ב-CHERY" (5 מילים)
    דוגמה גרועה: "הסיבות המרכזיות שבגללן כדאי לבחור במותג CHERY לקמפיין" (10 מילים)

19. כרטיסים: כותרת כרטיס מקסימום 4 מילים. גוף כרטיס מקסימום 15 מילים.
    דוגמה טובה: { title: "חשיפה ממוקדת", body: "קמפיין ממומן בטיקטוק ואינסטגרם לקהל 25-35" }
    דוגמה גרועה: { title: "חשיפה ממוקדת ומדויקת לקהל היעד", body: "..." }

20. keyNumber: תמיד עם סימן (₪, %, K, M). מקסימום 6 תווים.
    דוגמה טובה: "₪120K", "85%", "2.5M"
    דוגמה גרועה: "120,000 שקלים", "85 אחוז"

21. bodyText: מקסימום 2 משפטים קצרים. לא פסקה — זו מצגת, לא מסמך.

22. emotionalTone חייב להיות שונה בין שקופיות סמוכות.
    לא: dramatic, dramatic, dramatic
    כן: dramatic, warm, confident, bold, analytical
```

---

## סיכום — סדר יישום מומלץ

### שלב 1: תשתית (יום 1)
1. `typography.ts` — תיקון estimateTextHeight + הוספת getAdaptiveTitleScale
2. `types.ts` — הוספת direction ל-GridConfig
3. `grid.ts` — הוספת colRTL
4. `elements.ts` — min font size
5. `collision.ts` — iterative collision fix

### שלב 2: Compositions (יום 2)
6. `hero-center.ts` — adaptive title + watermark guard
7. `hero-left.ts` — RTL split
8. `split-screen.ts` — RTL + card overflow
9. `bento-grid.ts` — adaptive grid + min heights
10. `full-bleed.ts` — dynamic filter
11. `cards-float.ts` — single card fallback
12. `editorial.ts` — quote length guard
13. `data-art.ts` — missing number fallback
14. `timeline-flow.ts` — phase overflow

### שלב 3: Polish (יום 3)
15. `art-direction.ts` — content-aware prompt + validation
16. `decorative/index.ts` — RTL decorative
17. `colors.ts` — contrast validation
18. `depth.ts` — richer shadows
19. `index.ts` — adaptive pipeline
20. `slide-designer.ts` — prompt improvements

### שלב 4: Prompts (יום 4)
21. Design System prompt — premium quality rules
22. Content Plan prompt — copy length constraints
23. Art Direction prompt — content constraints

---

## מטריקת הצלחה

לפני השינויים:
- ~40% מהשקופיות עם טקסט שגולש
- ~60% נראות "אותו דבר" (generic)
- RTL שבור ב-hero-left, split-screen, decorative

אחרי השינויים (צפי):
- <5% overflow (adaptive scaling + better height estimation)
- מגוון ויזואלי אמיתי (content-aware art direction)
- RTL תקין (mirrored grid + decorative)
- קריאות מושלמת (contrast validation + min font)
- עומק ויזואלי (multi-layer shadows + stronger gradients)
