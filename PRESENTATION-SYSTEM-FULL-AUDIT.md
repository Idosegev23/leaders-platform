# מערכת יצירת מצגות — מיפוי מלא + בעיות + נקודות לשיפור

## 📌 תאריך: 9 באפריל 2026

---

## הזרימה המלאה — מה קורה מהרגע שהמשתמש נכנס

### שלב 1: Dashboard (`/dashboard`)
**מה רואים:** שני כרטיסים — "מצגת קריאטיב" + "הצעת מחיר". רשימת הצעות אחרונות.

**בעיות:**
- ❌ אין הסבר מה ההבדל בין שני הסוגים
- ❌ אין preview/demo של איך מצגת נראית לפני שמתחילים
- ❌ אין onboarding למשתמש חדש — נכנס ורואה ממשק ריק
- ❌ הצעות ישנות לא ניתנות למחיקה מהדשבורד

---

### שלב 2: העלאת בריף (`/create-proposal`)
**מה קורה:** המשתמש מעלה PDF/DOCX של בריף לקוח + מסמך התנעה אופציונלי.

**מה קורה מאחורי הקלעים:**
1. `parse-document` — ממיר PDF→טקסט (1-3 שניות)
2. `process-proposal` — AI מחלץ מידע מהבריף (15-40 שניות)
3. יוצר document ב-Supabase
4. מפנה ל-`/research/[id]`

**בעיות:**
- ❌ 15-40 שניות המתנה עם מסך ריק כמעט — רק terminal log
- ❌ אם ה-AI נופל (503) — הודעת שגיאה גנרית
- ❌ לא ברור למשתמש מה "מסמך התנעה" ולמה צריך אותו
- ❌ אין אפשרות להדביק טקסט במקום להעלות קובץ
- ⚠️ ה-extraction לפעמים מחלץ מידע לא רלוונטי (שם מותג שגוי, industry לא נכון)

---

### שלב 3: מחקר (`/research/[id]`)
**מה קורה:** 4 agents רצים במקביל — מחקר מותג, משפיענים, צבעים, תמונות.

**מה המשתמש רואה:** כרטיסי loading שמתמלאים אחד אחד.

**בעיות:**
- ❌ **אין עריכה ישירה בשלב הזה** — צריך להמתין ל-wizard (פידבק לירן!)
- ❌ תיאור מותג ארוך מדי — אין אפשרות לקצר/לערוך
- ❌ צבעים לפעמים שגויים (hardcoded fallback בלי הודעה)
- ❌ משפיענים מומצאים — שמות שלא קיימים (תוקן חלקית עם verification)
- ❌ אין input לקישורי סושיאל מדיה
- ❌ אם כל המחקר נכשל — "לא ידוע" בכל שדה (תוקן עם fallback flag)
- ⚠️ 10-30 שניות המתנה — לא ברור אם עדיין עובד או תקוע

---

### שלב 4: Wizard (`/wizard/[id]`) — 10 שלבים
**מה קורה:** המשתמש עובר על כל השלבים, בודק/מערך את הנתונים.

#### שלב 4.1: בריף ורקע
- שם מותג, רקע, נקודות כאב, מטרה
- **בעיות:**
  - ✅ תוקן: הוסף "למה הבריף הזה?" + source badges
  - ❌ תיאור מותג עדיין ארוך מדי — ה-trim hint לא מספיק, צריך auto-summarize
  - ❌ לא ברור מה "מטרת המותג" vs "למה הבריף"

#### שלב 4.2: מטרות ויעדים
- checkboxes של מטרות מוגדרות מראש + custom
- **בעיות:**
  - ❌ Descriptions של מטרות הן גנריות — לא ספציפיות למותג
  - ❌ אין חיבור בין מטרות ל-KPI (בשלב מאוחר יותר)

#### שלב 4.3: קהל יעד
- דמוגרפיה, פסיכוגרפיה, תובנות
- **בעיות:**
  - ❌ תובנות קהל (insights) לא מבוססות מחקר — AI ממציא
  - ❌ אין ציטוטים ממקורות אמיתיים (פידבק מפברואר!)
  - ❌ אין אפשרות להוסיף קהל משני

#### שלב 4.4: תובנה
- התובנה המרכזית + מקור + נתון תומך
- **בעיות:**
  - ❌ **התובנה לא "פוגעת"** (פידבק לירן!) — גנרית מדי
  - ❌ אין חיבור ברור בין תובנה → אסטרטגיה
  - ❌ "עדכן עם AI" לפעמים מחזיר משפט יותר ארוך ופחות חד
  - ⚠️ אם אין מחקר — התובנה ריקה

#### שלב 4.5: אסטרטגיה
- כותרת אסטרטגית + 3-5 pillars
- **בעיות:**
  - ❌ **"באוויר"** (פידבק לירן!) — לא קונקרטית מספיק
  - ❌ אין flowchart/diagram ויזואלי — רק טקסט
  - ❌ Pillars גנריים ("נוכחות דיגיטלית", "תוכן אותנטי") — לא ספציפיים למותג
  - ❌ אין חיבור ל-deliverables — pillar X = אילו תוצרים?

#### שלב 4.6: קריאייטיב
- שם קמפיין, קונספט, vibe, references
- **בעיות:**
  - ❌ אין ויזואליזציה של הקונספט — רק טקסט
  - ❌ References הם תמונות מ-Unsplash — לא בהכרח רלוונטי
  - ❌ לא מצוין פורמט תוכן (UGC? הפקה? mashup?)

#### שלב 4.7: תוצרים
- סוגי תוכן + כמויות + תיאורים
- **בעיות:**
  - ❌ רשימת התוצרים גנרית — לא מחוברת לאסטרטגיה
  - ❌ אין הבדל בין "סטורי" ל-"ריל" ל-"TikTok" מבחינת מחיר

#### שלב 4.8: כמויות
- מספר משפיענים, משך קמפיין, סה"כ תוצרים
- **בעיות:**
  - ❌ חישוב אוטומטי אבל לא ברור מאיפה הגיעו המספרים
  - ❌ אין validation — אפשר להגיד "100 משפיענים" בתקציב 10K

#### שלב 4.9: יעדי מדיה
- תקציב, reach, engagement, CPE
- **בעיות:**
  - ❌ **CPE לפעמים מחושב לא נכון** (פידבק לירן) — budget÷engagement
  - ❌ אם תקציב=0 (לא זוהה) — כל ה-KPIs שבורים (תוקן חלקית)
  - ❌ אין benchmark — "CPE של ₪5 זה טוב?" — המשתמש לא יודע

#### שלב 4.10: משפיענים
- 8-12 פרופילים עם שם, handle, followers, engagement
- **בעיות:**
  - ❌ **שמות מומצאים** (תוקן חלקית עם Google verification)
  - ❌ אין חיבור ל-IMAI (פידבק לירן)
  - ❌ תמונות פרופיל לא מוצגות
  - ❌ engagement rate לא מאומת — AI ממציא מספרים

---

### שלב 5: ייצור מצגת (`/generate/[id]`)
**מה קורה:** 5 שלבים — research → visuals → foundation → 3 batches → finalize.

**זמנים:**
| שלב | זמן ממוצע | מה קורה |
|------|----------|---------|
| Foundation | 20-40s | Design System (Gemini) + Planner (GPT-5.4) |
| Batch 1-3 | 30-60s × 3 | HTML slides generation (GPT-5.4) |
| Finalize | 10-20s | Logo injection + validation |
| **סה"כ** | **3-5 דקות** | |

**בעיות:**
- ❌ **3-5 דקות זה ארוך** — המשתמש מחכה
- ❌ Batches רצים **ברצף** (sequential), לא מקביל — אפשר לחסוך 40%
- ❌ אם batch נכשל — retry, אבל המשתמש לא יודע
- ❌ אין "המשך ברקע" שעובד טוב — refresh הדף מאבד progress
- ❌ Template selector לא עובד 100% — hints לא תמיד מגיעים ל-design system
- ⚠️ לפעמים GPT מחזיר פחות שקפים ממה שצריך

---

### שלב 6: עורך מצגת (`/edit/[id]`)
**מה רואים:** sidebar thumbnails + main canvas + toolbar.

**בעיות — תצוגה:**
- ❌ **iframe ב-55% scale** — קשה לקרוא טקסט קטן
- ❌ אין zoom in/out
- ❌ thumbnails קטנים מדי (9% scale) — לא רואים כלום
- ❌ אין slide overview/grid view (כל השקפים ביחד)
- ❌ אין presentation mode (fullscreen slideshow)

**בעיות — עריכה:**
- ❌ **Double-click editing** — עובד אבל לא אינטואיטיבי. אין cursor indication
- ❌ **Drag** — עובד אבל ללא snap-to-grid, ללא alignment guides
- ❌ אין undo/redo (Ctrl+Z לא עובד)
- ❌ אין duplicate element / delete element
- ❌ אין font change / color change / size change (חוץ מ-contentEditable)
- ❌ אין add new element (text box, image, shape)
- ❌ שינויים נשמרים בעיכוב — לפעמים lost changes

**בעיות — כפתורים:**
- ✅ Regenerate slide — עובד
- ✅ Share — עובד
- ✅ Follow-up reminder — עובד
- ❌ PDF download — לוקח 30-90 שניות, אין progress bar
- ❌ אין "ייצא ל-PPTX"
- ❌ אין "שמור ל-Google Drive" (כפתור קיים אבל?)
- ❌ אין "שכפל מצגת"

---

### שלב 7: PDF (`/api/pdf`)
**מה קורה:** Playwright פותח כל slide, מצלם screenshot, מרכיב PDF.

**בעיות:**
- ❌ **30-90 שניות** — ארוך מדי
- ❌ אפקטי CSS (glassmorphism, blur, gradients) לפעמים לא יוצאים טוב ב-PDF
- ❌ אין אפשרות לבחור איכות (draft vs high quality)
- ❌ אין preview של PDF לפני הורדה
- ❌ קובץ PDF גדול (5-15MB ל-15 שקפים)

---

### שלב 8: שיתוף (`/s/[token]`)
**מה קורה:** קישור ציבורי שמציג את המצגת.

**בעיות:**
- ❌ אין ניווט שקפים (חיצים, keyboard)
- ❌ אין fullscreen mode
- ❌ אין comments/feedback מהצופה
- ❌ כל השקפים מוצגים ברצף — לא כ-slideshow
- ❌ אין analytics מעבר ל-view_count (כמה זמן על כל שקף?)

---

## סיכום בעיות לפי חומרה

### 🔴 קריטי — משפיע על המוצר

| # | בעיה | איפה |
|---|------|------|
| 1 | תובנה לא "פוגעת" — גנרית | Wizard step 4 + Planner prompt |
| 2 | אסטרטגיה "באוויר" | Wizard step 5 + Planner prompt |
| 3 | 3-5 דקות ייצור — ארוך מדי | Generate page + batches sequential |
| 4 | אין עריכה אמיתית (font, color, add) | Edit page + HtmlSlideEditor |
| 5 | טקסט זולג/נחתך | HTML prompt + CSS |
| 6 | משפיענים מומצאים | Influencer research |

### 🟡 גבוה — משפיע על חוויה

| # | בעיה | איפה |
|---|------|------|
| 7 | Wizard מסורבל — 10 שלבים | Wizard flow |
| 8 | אין zoom/grid view בעורך | Edit page |
| 9 | PDF איטי + לא מושלם | PDF route |
| 10 | Share page חסר ניווט + fullscreen | Share page |
| 11 | אין onboarding | Dashboard |
| 12 | לא ברור מה extracted vs AI generated | Wizard all steps |

### 🟠 בינוני — שיפור נחמד

| # | בעיה | איפה |
|---|------|------|
| 13 | אין PPTX export | Edit page |
| 14 | אין presentation mode | Edit page |
| 15 | אין slide reorder (drag thumbnails) | Edit page |
| 16 | אין benchmark ל-CPE/KPI | Wizard step 9 |
| 17 | References לא רלוונטיים | Wizard step 6 |
| 18 | אין IMAI integration | Wizard step 10 |

---

## ארכיטקטורת ה-HTML Slide Generation

### הזרימה:
```
Wizard Data
    ↓
Planner (GPT-5.4) → SlidePlan[] (9+2 שקפים, תוכן בעברית)
    ↓
Design System (Gemini Pro) → PremiumDesignSystem (צבעים, טיפוגרפיה, creative direction)
    ↓
HTML Batch × 3 (GPT-5.4) → string[] (כל שקף = HTML מלא)
    ↓
Post-Processing → safety CSS injection + logo injection
    ↓
_htmlPresentation (נשמר ב-Supabase)
    ↓
Editor (iframe srcDoc) → PDF (Playwright screenshots)
```

### ה-HTML prompt (מה GPT מקבל):
1. Design system (צבעים, פונטים, creative metaphor)
2. 5-Layer Model (background → atmosphere → structure → content → overlay)
3. CSS Arsenal (glassmorphism, aurora, text-stroke, shadows, gradients)
4. Per-slide content (title, body, cards, images, stats)
5. Rules (RTL, Hebrew, overflow protection, variety)

### בעיות בפייפליין:
- ❌ **GPT output לא עקבי** — לפעמים שקפים חסרים, לפעמים HTML שבור
- ❌ **CSS effects** — backdrop-filter, mix-blend-mode לא תמיד מרונדרים ב-PDF
- ❌ **תמונות** — GPT לפעמים לא משתמש בתמונות שזמינות
- ❌ **Variety** — למרות rules, GPT חוזר על backgrounds דומים
- ❌ **Token limit** — prompt ארוך (8-10K chars) → GPT לפעמים חותך תשובה

---

## הפרומפטים שהשולטים בכל

### 1. Planner Prompt (slide-designer.ts, line ~300-380)
**מה עושה:** מתכנן את התוכן של כל 11 השקפים בעברית.
**Input:** brand data + research + images + creative direction
**Output:** SlidePlan[] (11 items)
**בעיות:**
- prompt ארוך (30K chars כולל data)
- rules ספציפיים לסוגי שקפים (מי cover, מי closing)
- word limits (כותרת ≤8, גוף ≤40)

### 2. HTML Batch Prompt (slide-designer.ts, line ~1300-1400)
**מה עושה:** מייצר HTML/CSS מלא לכל שקף.
**Input:** design system + slide content + CSS arsenal + 5-layer model
**Output:** string[] (5-6 HTML documents per batch)
**בעיות:**
- prompt ענק (~8K chars)
- CSS rules מפורטים מדי — GPT לפעמים מתעלם
- safety CSS מוזרק ב-post-processing (טוב!)

### 3. Design System Prompt (slide-designer.ts, line ~180-200)
**מה עושה:** מייצר creative direction + color system + typography.
**Input:** brand colors + industry + personality
**Output:** PremiumDesignSystem JSON
**בעיות:**
- עובד טוב — Gemini Pro מצוין לזה
- Creative direction לפעמים גנרית ("modern and clean")

---

## ממשק העורך — מיפוי מלא

### מה יש:
- ✅ iframe viewer ב-55% scale
- ✅ Thumbnails בsidebar
- ✅ Double-click לעריכת טקסט (contentEditable)
- ✅ Drag elements (mousedown + mousemove)
- ✅ Regenerate per slide
- ✅ Share link
- ✅ PDF download
- ✅ Follow-up reminder
- ✅ Keyboard navigation (arrow keys)

### מה חסר:
- ❌ **Zoom control** (pinch/scroll zoom)
- ❌ **Grid/overview view** (כל השקפים ביחד)
- ❌ **Undo/Redo** (Ctrl+Z)
- ❌ **Properties panel** (font, color, size, position)
- ❌ **Add elements** (text, image, shape)
- ❌ **Delete element** (selected element)
- ❌ **Duplicate element**
- ❌ **Alignment guides** (snap to grid, center, edges)
- ❌ **Slide reorder** (drag thumbnails)
- ❌ **Presentation mode** (fullscreen slideshow)
- ❌ **Export PPTX**
- ❌ **History panel** (version comparison)

---

## מה לעשות הלאה — סדר עדיפויות

### עדיפות 1: Content Quality (שבוע 1)
1. תובנה חזקה יותר — שפר prompt + דוגמאות
2. אסטרטגיה קונקרטית — pillars → deliverables חיבור
3. Wizard consolidation — 10 שלבים → 7 (מזג quantities+media, creative+deliverables)

### עדיפות 2: Generation Speed (שבוע 2)
4. Parallel batches (לא sequential) — חיסכון 40%
5. Cache design system — אם אותו מותג, לא מייצר מחדש
6. Streaming response — הצג שקפים ככל שנוצרים

### עדיפות 3: Editor UX (שבוע 3)
7. Zoom + grid view
8. Properties panel (font, color, size)
9. Undo/redo
10. Slide reorder

### עדיפות 4: Output Quality (שבוע 4)
11. PDF quality — test + fix CSS effects
12. Text overflow final fix — TypeScript auto-fit layer
13. Image usage — force GPT to use provided images
14. PPTX export

### עדיפות 5: Collaboration (שבוע 5)
15. Share page — slideshow mode + navigation
16. Comments per slide
17. Version history UI
18. Presentation mode
