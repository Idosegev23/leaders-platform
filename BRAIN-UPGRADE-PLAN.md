# Brain Upgrade Plan — שדרוג המוח של מנוע ההצעות

## סטטוס כללי

| # | בעיה | חומרה | סטטוס | הערות |
|---|------|-------|-------|-------|
| 1 | Proposal Agent — פרומפט מנופח + מודל לא עקבי | 🔴 קריטי | ✅ הושלם | GPT-5.4 + prompt 150→30 lines |
| 2 | משפיענים מומצאים — אפס ולידציה | 🔴 קריטי | ✅ הושלם | Google Search verification per name |
| 3 | מחקר מותג ב-LOW thinking + אין cross-validation | 🔴 קריטי | ✅ הושלם | Flash+HIGH, Pro fallback, cross-validation=שלב 2 |
| 4 | Wizard לא מבדיל עובדות מספקולציות | 🟡 גבוה | ✅ הושלם | ConfidenceIndicator component + fieldConfidence map |
| 5 | תקציב 0 עובר בשקט | 🟡 גבוה | ✅ הושלם | null instead of 0, planner warned, display fixed |
| 6 | Data loss: Brief → Wizard mapping | 🟡 גבוה | ✅ הושלם | influencer prefs mapped + _briefExtras for unmapped |
| 7 | Image Strategy מנותקת מ-Slide Design | 🟠 בינוני | ✅ הושלם | slideDesignHints passed through chain |
| 8 | Fallbacks שקטים — משתמש לא יודע | 🟠 בינוני | ✅ הושלם | _isFallback flags + wizard warnings banner |
| 9 | מודלים לא עקביים | 🔵 מבנה | ✅ הושלם | GPT-5.4/Flash+HIGH/Pro model hierarchy |
| 10 | אין audit trail | 🔵 מבנה | ✅ הושלם | generation-log.ts + _auditLog saved to document |

---

## בעיה 1: Proposal Agent — המוח המרכזי

### מה שבור
- פרומפט 413 שורות — 50% הרצאה, 50% ביצוע
- משתמש ב-Claude Opus כ-primary (סותר ארכיטקטורה)
- מנסה ללמד "איך לחשוב כמו VP" במקום לבצע
- אין הפרדה בין עובדות שחולצו לספקולציות שנוצרו
- budget=0 כשלא נמצא (צריך null)

### מה צריך לעשות
1. **שכתוב הפרומפט** — מ-413 שורות ל-~150 שורות ממוקדות
   - חלק 1: "חלץ עובדות מהבריף" (extraction — factual only)
   - חלק 2: "צור אסטרטגיה על בסיס העובדות" (generation — creative)
   - הפרדה ברורה: כל שדה מסומן `source: "extracted" | "generated"`
2. **מודל**: GPT-5.4 (primary) → Gemini Pro (fallback)
   - GPT-5.4 מצוין בעברית + long context
   - Responses API עם strict JSON schema
3. **Confidence scoring**: כל שדה מקבל `confidence: 0-1`
4. **Null handling**: שדות לא נמצאו = `null`, לא `0` או `""`

### קבצים
- `src/lib/gemini/proposal-agent.ts` — שכתוב מלא
- `src/types/brief.ts` — הוספת `source` ו-`confidence` לכל שדה

### הערכת זמן: 3-4 שעות

---

## בעיה 2: משפיענים מומצאים

### מה שבור
- Gemini ממציא שמות של משפיענים ישראליים
- אין שום ולידציה — אין Instagram API, אין cross-reference
- `needsVerification: true` קיים בסכמה אבל אף אחד לא מוודא

### מה צריך לעשות
1. **Google Search verification**: אחרי שGemini מחזיר שמות, חיפוש Google לכל שם
   - `"{name}" instagram influencer israel` → בדוק שיש תוצאות
   - אם אין תוצאות → סמן `verified: false`
2. **Confidence based on search results**: אם נמצאו 5+ תוצאות רלוונטיות → high, 2-4 → medium, 0-1 → low
3. **UI indication**: בwizard, משפיענים עם `verified: false` מקבלים badge אדום "דורש בדיקה"
4. **Fallback**: אם 0 משפיענים verified → הצג הודעה "לא נמצאו משפיענים מאומתים, יש להזין ידנית"

### קבצים
- `src/lib/gemini/influencer-research.ts` — הוספת verification step
- Wizard influencer step — הצגת verification status

### הערכת זמן: 2-3 שעות

---

## בעיה 3: מחקר מותג חלש

### מה שבור
- 4 agents עם `thinkingLevel: LOW` — לא מספיק לסינתזה
- סינתזה של 24K input ל-16K output = אובדן מידע
- אין cross-validation בין agents
- Fallback = "לא ידוע" בכל שדה

### מה צריך לעשות
1. **Thinking level**: שינוי ל-`MEDIUM` לפחות ל-synthesis
2. **Cross-validation**: אחרי ש-4 agents חוזרים, בדוק:
   - מספר מתחרים עקבי?
   - קהל יעד לא סותר?
   - נתוני שוק מתיישבים?
   - אם סתירה → flag + resolve ב-synthesis
3. **Synthesis improvement**:
   - במקום סינתזה אחת ענקית → 2 שלבים:
     - שלב 1: merge facts (dedup + resolve contradictions)
     - שלב 2: generate insights from merged facts
4. **Confidence per section**: כל חלק במחקר מקבל confidence score
5. **Better fallback**: במקום "לא ידוע" → חיפוש Google בסיסי כ-last resort

### קבצים
- `src/lib/gemini/brand-research.ts` — שדרוג thinking + cross-validation
- Brand research types — הוספת confidence per section

### הערכת זמן: 3-4 שעות

---

## בעיה 4: Wizard לא מבדיל עובדות מספקולציות

### מה שבור
- משתמש רואה AI-generated content כאילו זו עובדה
- אין indicator ויזואלי מה חולץ מהבריף ומה AI המציא
- אין "flag for review" option

### מה צריך לעשות
1. **Visual indicators**:
   - 🟢 חולץ מהבריף (extraction) — גבול ירוק
   - 🟡 נוצר ע"י AI (generation) — גבול צהוב + badge "AI"
   - 🔴 confidence נמוך — גבול אדום + "דורש בדיקה"
2. **Confidence display**: tooltip עם "ודאות: 87%" על כל שדה
3. **Flag button**: כפתור 🚩 ליד כל שדה — "סמן לבדיקה"
4. **Regenerate button**: כפתור 🔄 ליד שדות AI — "ייצר מחדש"

### קבצים
- `src/components/wizard/steps/` — כל step component
- `src/types/wizard.ts` — הוספת metadata per field

### הערכת זמן: 4-5 שעות (UI work)

---

## בעיה 5: תקציב 0 עובר בשקט

### מה שבור
- `budget: 0` כשלא נמצא → CPE/CPM מחושבים על 0
- אין אזהרה למשתמש
- המצגת מציגה "₪0" כתקציב

### מה צריך לעשות
1. **Null instead of 0**: `budget: null` כשלא נמצא
2. **Warning in wizard**: "תקציב לא זוהה מהבריף — יש להזין ידנית"
3. **Block slide generation**: אם budget=null ו-user לא הזין → warning לפני generate
4. **Smart estimation**: אם יש deliverables + timeline → הצע estimation range

### קבצים
- `src/lib/gemini/proposal-agent.ts` — null handling
- Wizard budget step — warning UI
- `src/lib/gemini/slide-designer.ts` — handle null budget in planner

### הערכת זמן: 1-2 שעות

---

## בעיה 6: Data Loss — Brief → Wizard

### מה שבור
- `ExtractedBriefData` (15 שדות) → `WizardStepDataMap` (10 steps) = mapping לא ברור
- שדות נעלמים בשקט
- אין mapping spec מתועד

### מה צריך לעשות
1. **Document mapping**: טבלה ברורה — איזה שדה brief הולך לאיזה wizard step
2. **Validate mapping**: unit test שבודק שכל שדה brief מגיע ל-wizard
3. **"Unmapped fields" warning**: אם brief שדות שלא מופו → הצג ב-wizard "מידע נוסף מהבריף"
4. **Two-way sync**: שינוי ב-wizard חוזר ל-extracted data

### קבצים
- `src/components/wizard/wizard-utils.ts` — mapping functions
- New: mapping spec document

### הערכת זמן: 2-3 שעות

---

## בעיה 7: Image Strategy מנותקת

### מה שבור
- Image Strategist לא יודע מה Slide Designer צריך
- אין feedback loop
- Fallback = תמונות גנריות

### מה צריך לעשות
1. **Pass creative direction to image strategist**: אחרי שDS נוצר, העבר את ה-creative metaphor ל-image strategy
2. **Image roles aligned with slide types**: cover image → hero style, audience → people, etc.
3. **Quality check**: אם תמונה נוצרה אבל לא רלוונטית → flag

### קבצים
- `src/lib/gemini/image-strategist.ts` — קבלת creative direction
- `src/app/api/generate-visual-assets/route.ts` — pass DS

### הערכת זמן: 2 שעות

---

## בעיה 8: Fallbacks שקטים

### מה שבור
- מחקר נכשל → "לא ידוע" → Wizard ממשיך
- צבעים נכשלו → hardcoded → משתמש לא יודע
- אין logging של fallback events

### מה צריך לעשות
1. **Fallback registry**: object שמתעד כל fallback שקרה
   ```ts
   _fallbacks: { brandColors: 'hardcoded', research: 'minimal', influencers: 'none' }
   ```
2. **UI banners**: בwizard, banner צהוב "חלק מהנתונים מבוססים על הערכה — מומלץ לבדוק"
3. **Fallback quality score**: מחשב כמה מהdata הוא fallback vs real

### קבצים
- All API routes — register fallback events
- Wizard — display fallback banners

### הערכת זמן: 2-3 שעות

---

## בעיה 9: מודלים לא עקביים

### מה שבור
- Proposal Agent = Claude (סותר)
- Brand Research = Flash + LOW (חלש)
- Image Strategist = Flash first (הפוך)

### מה צריך לעשות
1. **Standardize**:
   - Heavy analysis (proposal, synthesis) → GPT-5.4 (proven in planner)
   - Research agents (search + extract) → Gemini Flash (fast, good for search)
   - Design system → Gemini Pro (short prompt, works great)
   - Slide generation → GPT-5.4 HTML (current v6)
2. **Config in one place**: כל מודלים מנוהלים דרך admin config

### קבצים
- `src/lib/gemini/proposal-agent.ts` — switch to GPT-5.4
- `src/lib/config/defaults.ts` — model config

### הערכת זמן: 1-2 שעות

---

## בעיה 10: אין Audit Trail

### מה שבור
- לא רשום איזה prompt יצר מה
- לא ניתן לעקוב למה נוצרה תובנה X
- אין version history

### מה צריך לעשות
1. **Prompt logging**: כל קריאת AI שומרת prompt hash + response hash
2. **Generation metadata**: כל שדה ב-wizard שומר `{ generatedBy, modelUsed, promptVersion, timestamp }`
3. **Version history**: array של outputs קודמים per field

### קבצים
- New: `src/lib/audit/generation-log.ts`
- All AI callers — add logging

### הערכת זמן: 3-4 שעות

---

## סדר ביצוע מומלץ

```
שלב 1 (Foundation):
  בעיה 9  — מודלים עקביים (1-2h)     ← מתקן את הבסיס
  בעיה 5  — תקציב null (1-2h)         ← quick win
  בעיה 8  — fallback registry (2-3h)   ← visibility

שלב 2 (Brain):
  בעיה 1  — Proposal Agent rewrite (3-4h)  ← הליבה
  בעיה 3  — Brand Research upgrade (3-4h)   ← data quality

שלב 3 (Verification):
  בעיה 2  — Influencer verification (2-3h)  ← trust
  בעיה 6  — Brief→Wizard mapping (2-3h)     ← data integrity

שלב 4 (UX):
  בעיה 4  — Wizard confidence UI (4-5h)     ← user trust
  בעיה 7  — Image↔Slide alignment (2h)      ← visual quality

שלב 5 (Observability):
  בעיה 10 — Audit trail (3-4h)              ← debugging + learning
```

**סה"כ הערכה: 25-35 שעות עבודה**

---

## מעקב

כל שינוי שנעשה → עדכון הטבלה למעלה:
- ⬜ לא התחיל
- 🔄 בעבודה
- ✅ הושלם
- 🧪 בבדיקה
