# תוכנית פעולה — פידבק לירן (9 באפריל 2026)

## עדיפות 1: פישוט הזרימה (הכי דחוף)

### 1A. קיצור סוגי שקפים — מ-17 ל-9+2
**קבוע ומחייב:**
```
cover → בריף → מטרות → קהלים → תובנה → אסטרטגיה → קריאייטיב → תוצרים → משפיענים → KPI → closing
```

**להסיר מה-Planner:**
- ❌ whyNow (חלון הזדמנויות)
- ❌ competitive (ניתוח תחרותי)
- ❌ approach (גישה)
- ❌ contentStrategy (אסטרטגיית תוכן)
- ❌ timeline (לוח זמנים)

**קבצים לשנות:**
- `src/lib/gemini/slide-designer.ts` — Planner prompt: שנה רשימת סוגים מ-17 ל-9
- `src/lib/slide-engine/intent-prompt.ts` — עדכן available compositions
- `src/lib/slide-engine/layout-resolver.ts` — אפשר להשאיר compositions ישנות (לא יקראו)
- `src/lib/gemini/slide-design/fallbacks.ts` — עדכן fallback plan

**הערכה:** 1-2 שעות

### 1B. Wizard — שלב המחקר (Step 2)
- [ ] הוסף שדה "למה הבריף הזה?" — האתגר/הבעיה ברמה גבוהה
- [ ] תיאור מותג — הוסף כפתור "ערוך" שפותח textarea ישירות
- [ ] נקודות כאב — הוסף badge מקור: "מהבריף 📋" / "מהמחקר 🔍"
- [ ] הוסף שדה social media links (Instagram, TikTok, Facebook)
- [ ] אסטרטגיית משפיענים — שנה כותרת ותוכן להיות ספציפי למשפיענים

**קבצים:**
- `src/components/wizard/steps/` — step components
- `src/types/wizard.ts` — הוסף שדות חדשים

**הערכה:** 3-4 שעות

---

## עדיפות 2: איכות תוכן

### 2A. תובנה חזקה
- [ ] שפר את ה-prompt של Proposal Agent: "התובנה חייבת להיות חדה, מפתיעה, ומבוססת על נתון אמיתי"
- [ ] הוסף דוגמאות של תובנות טובות ב-prompt
- [ ] התובנה חייבת לחבר לאסטרטגיה — "התובנה מובילה ישירות לאסטרטגיה"

**קבצים:**
- `src/lib/gemini/proposal-agent.ts` — insight section in prompt

**הערכה:** 1-2 שעות

### 2B. אסטרטגיה קונקרטית
- [ ] שפר prompt: "האסטרטגיה חייבת להיות קונקרטית — מה עושים, איפה, מתי, כמה"
- [ ] הוסף structure: headline + 3 pillars + expected outcomes
- [ ] לא "באוויר" — כל pillar מחובר ל-deliverable ספציפי

**קבצים:**
- `src/lib/gemini/proposal-agent.ts` — strategy section

**הערכה:** 1 שעה

---

## עדיפות 3: תיקוני חישובים

### 3A. CPE
- [ ] מצא את החישוב הנוכחי ותקן: CPE = תקציב ÷ מוערבות (engagement)
- [ ] ודא שהנוסחה נכונה בכל המקומות

**קבצים:**
- `src/components/wizard/steps/` — media targets step
- חפש `cpe` בכל הקוד

**הערכה:** 30 דקות

---

## עדיפות 4: עיצוב

### 4A. פחות טקסט, יותר ויז'ואל
- [ ] שפר HTML prompt: "כל שקף — מקסימום 3 שורות טקסט. השאר = ויזואלי"
- [ ] הוסף rule: "אם יש יותר מ-5 bullet points — הפוך ל-cards עם אייקונים"
- [ ] הוסף rule: "numbers always in huge font, not in text"

### 4B. טקסט לא נחתך
- [ ] בדוק overflow handling ב-HTML slides
- [ ] הוסף ל-prompt: "text must NEVER overflow the slide boundaries"

**הערכה:** 1 שעה

---

## עדיפות 5: לעתיד

### 5A. IMAI Integration
- [ ] בדוק IMAI API — האם יש SDK?
- [ ] אם כן — החלף את Gemini influencer search ב-IMAI data

### 5B. Social Media Analysis
- [ ] קבל Instagram handle → שלוף נתונים (followers, engagement rate)
- [ ] הצג בwizard ובמצגת

---

## סדר ביצוע

```
שלב 1 (היום):
  1A — קיצור שקפים מ-17 ל-9      ← 1-2h, highest impact
  3A — תיקון CPE                   ← 30min

שלב 2 (מחר):
  2A — תובנה חזקה                  ← 1-2h
  2B — אסטרטגיה קונקרטית           ← 1h
  4A — פחות טקסט ב-HTML            ← 1h

שלב 3 (אח"כ):
  1B — Wizard UX improvements       ← 3-4h
  4B — Overflow fix                 ← 1h
  5A — IMAI integration             ← research first
```
