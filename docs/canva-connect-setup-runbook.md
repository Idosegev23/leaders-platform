# Canva Connect — Runbook חיבור מקצה-לקצה (ל-Claude בכרום)

> מטרה: לחבר את מערכת Leaders ל-**Canva Connect API** כדי שנוכל לייבא את המצגות שאנחנו מפיקים (PPTX/PDF) ל-Canva כעיצוב ניתן-לעריכה, ולקבל `edit_url`.
> חשוב: החלפת ה-authorization code ל-token **חייבת** לרוץ בצד-שרת (Canva חוסמת בקשות token מהדפדפן ב-CORS). לכן שלב 6 מתבצע דרך route ייעודי באפליקציה (`/api/canva/oauth/callback`) שנבנה בנפרד.

---

## פרטי-אמת קבועים (להעתקה מדויקת)

| פריט | ערך מדויק |
|---|---|
| Developer Portal | `https://www.canva.com/developers/` |
| רשימת אינטגרציות | `https://www.canva.com/developers/integrations/` |
| Authorization endpoint | `https://www.canva.com/api/oauth/authorize` |
| Token endpoint | `POST https://api.canva.com/rest/v1/oauth/token` |
| API base | `https://api.canva.com/rest/v1/` |
| Import מ-URL | `POST https://api.canva.com/rest/v1/url-imports` |
| Import מקובץ | `POST https://api.canva.com/rest/v1/imports` |
| בדיקת סטטוס Import | `GET https://api.canva.com/rest/v1/url-imports/{jobId}` |
| Redirect URI (production) | `https://leaders-platform.vercel.app/api/canva/oauth/callback` |
| Redirect URI (dev, אופציונלי) | `http://127.0.0.1:3000/api/canva/oauth/callback` |
| Scopes נדרשים | `design:content:write design:meta:read design:content:read` |
| חיי access token | 4 שעות (14400 שניות) |
| refresh token | **מתחלף בכל רענון (single-use)** → חייב להישמר ב-DB, לא ב-ENV |

---

## שלב 0 — לפני שמתחילים

Claude-בכרום צריך גישה מחוברת (logged-in) ל:
1. **חשבון Canva של Leaders** — עדיף חשבון-שירות משותף (למשל `canva@ldrsgroup.com`), כי כל המצגות המיובאות ייחתו לתיקיית ה-Projects של החשבון הזה. **אל תשתמש בחשבון פרטי של עובד.**
2. **Vercel** — פרויקט `idosegev23s-projects/leaders-platform`.
3. **Supabase** — פרויקט `fhgggqnaplshwbrzgima` (רק אם נדרשת מיגרציה; ראה שלב 5ב).

---

## שלב 1 — יצירת אינטגרציית Connect ב-Canva

1. נווט ל: `https://www.canva.com/developers/integrations/`
2. ודא שאתה מחובר לחשבון-השירות של Leaders (בדוק אווטאר/מייל בפינה). אם לא — התנתק והתחבר לחשבון הנכון.
3. לחץ **Create an integration** (או "+ Integration").
4. בחר סוג:
   - אם לחשבון יש ארגון Canva (Teams/Enterprise) → **Private** (מוגבל לארגון, לא דורש אישור Canva).
   - אחרת → **Public**. שים לב: אינטגרציה Public ניתנת לשימוש **במצב Development** ע"י בעל-החשבון עצמו **בלי** להגיש לאישור. אנחנו נשארים ב-Development — **אין להגיש לביקורת (Submit for review)**, כי רק חשבון-השירות שלנו מאשר אותה.
5. שם האינטגרציה: `Leaders Platform`.
6. שמור.

---

## שלב 2 — הגדרת Scopes

בעמוד ה-**Configuration / Scopes** של האינטגרציה, סמן **בדיוק** את ה-scopes הבאים (ותו לא):

- ✅ `design:content:write`  (יצירה/ייבוא עיצובים)
- ✅ `design:meta:read`  (קריאת מטא-דאטה של עיצוב — לחידוש לינקים)
- ✅ `design:content:read`  (קריאת תוכן/ייצוא עתידי)

שמור. (הערה: כל scope חייב להיות מסומן במפורש — סימון write אינו מקנה read.)

---

## שלב 3 — הגדרת Redirect URL

בעמוד **Authentication / Redirect URLs** של האינטגרציה, הוסף כתובת אחת (או שתיים):

1. Production (חובה):
   ```
   https://leaders-platform.vercel.app/api/canva/oauth/callback
   ```
2. Dev (אופציונלי, אם נבדוק לוקאלית):
   ```
   http://127.0.0.1:3000/api/canva/oauth/callback
   ```

⚠️ ההתאמה חייבת להיות **מדויקת לתו** (כולל https, ללא סלאש נוסף בסוף). שמור.

---

## שלב 4 — העתקת Client ID + Client Secret

1. בעמוד ה-Configuration, העתק את **Client ID**.
2. לחץ **Generate secret** (או "Generate a new secret") והעתק מיד את **Client Secret** — הוא מוצג פעם אחת בלבד.
3. שמור את שניהם זמנית במקום בטוח להעברה לשלב 5.

---

## שלב 5 — הגדרות באפליקציה

### 5א. משתני סביבה ב-Vercel
נווט ל: `https://vercel.com/idosegev23s-projects/leaders-platform/settings/environment-variables`

הוסף את המשתנים הבאים ל-**Production, Preview, Development** (שלושתם):

| Name | Value |
|---|---|
| `CANVA_CLIENT_ID` | (ה-Client ID משלב 4) |
| `CANVA_CLIENT_SECRET` | (ה-Client Secret משלב 4) |
| `CANVA_REDIRECT_URI` | `https://leaders-platform.vercel.app/api/canva/oauth/callback` |
| `CANVA_SCOPES` | `design:content:write design:meta:read design:content:read` |

> ⚠️ **אל תוסיף** `CANVA_REFRESH_TOKEN` כמשתנה סביבה. ה-refresh token מתחלף בכל רענון, ולכן הוא נשמר אוטומטית בטבלת DB ע"י ה-callback (שלב 6). ENV סטטי היה נשבר אחרי הרענון הראשון.

> ⚠️ בעת הדבקה — הדבק ערך נקי בלי רווח/שורה בסוף (זה שובר חתימות).

### 5ב. מיגרציית DB (רק אם ה-route מבקש טבלה שלא קיימת)
אם אחרי הפריסה `/api/canva/oauth/callback` מחזיר שגיאה על טבלה חסרה (`integration_tokens`), הרץ ב-Supabase SQL Editor
(`https://supabase.com/dashboard/project/fhgggqnaplshwbrzgima/sql/new`) את המיגרציה שתסופק עם ה-route. (אין צורך לפעול יזום — רק אם מתבקש.)

---

## שלב 6 — אישור החיבור (OAuth) — ⚠️ אחרי שה-route נפרס

> תלוי: הצוות (Claude Code) בנה ופרס את `/api/canva/oauth/start` + `/api/canva/oauth/callback`. בלי זה — עצור אחרי שלב 5.

1. ודא שאתה עדיין מחובר לחשבון-השירות של Leaders ב-Canva (באותו דפדפן).
2. נווט אל:
   ```
   https://leaders-platform.vercel.app/api/canva/oauth/start
   ```
   ה-route ייצר `code_verifier` + `state` (בצד-שרת), ויפנה אותך ל-Canva.
3. במסך ההרשאה של Canva — ודא שרשומים ה-scopes הנכונים, ולחץ **Allow**.
4. Canva תחזיר אותך ל-`/api/canva/oauth/callback`. ה-route יבצע את החלפת ה-token בצד-שרת וישמור את ה-refresh token ב-DB.
5. הצלחה = עמוד/הודעת `Canva connected ✓` (או redirect ל-`/dashboard?canva=connected`).

### (למקרה ידני בלבד — הרכבת ה-authorize URL)
אם תתבקש להרכיב את כתובת ההרשאה ידנית, הפורמט:
```
https://www.canva.com/api/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&redirect_uri=https%3A%2F%2Fleaders-platform.vercel.app%2Fapi%2Fcanva%2Foauth%2Fcallback&scope=design%3Acontent%3Awrite%20design%3Ameta%3Aread%20design%3Acontent%3Aread&code_challenge=<CHALLENGE_S256>&code_challenge_method=S256&state=<RANDOM>
```
⚠️ החלפת ה-`code` ל-token (`POST https://api.canva.com/rest/v1/oauth/token`, עם `Authorization: Basic base64(client_id:client_secret)`) **לא תעבוד מהדפדפן** (CORS) — רק דרך ה-callback בצד-שרת.

---

## שלב 7 — אימות שהחיבור עובד

לאחר שלב 6, בדוק שהאפליקציה יכולה ליצור import (הצוות יריץ בדיקה, או דרך endpoint פנימי):
- ציפייה: קריאה ל-`POST /rest/v1/url-imports` עם access token תקף מחזירה `job.id`, ואז `GET /rest/v1/url-imports/{jobId}` מחזיר `design` עם `urls.edit_url` + `urls.view_url`.
- אם מתקבל `401` → הטוקן פג/לא נשמר; אם `403`/`invalid_scope` → חסר scope (חזור לשלב 2).

---

## נספח — חיבורים אחרים (כבר מחוברים — רק לאימות)

אלה כבר עובדים בקוד; Claude-בכרום צריך רק לוודא שהמשתנים קיימים ב-Vercel (אין להחליף ערכים בלי צורך):

| חיבור | env vars מרכזיים | סטטוס |
|---|---|---|
| Google / Gmail (שליחת מיילים + Drive) | `SUPABASE_SERVICE_ROLE_KEY`, `BRIEF_DEFAULT_SENDER_EMAIL`, `SYSTEM_SENDER_EMAIL`, `user_google_tokens` (DB) | מחובר |
| ClickUp | טוקן ClickUp הקיים | מחובר |
| Salesforce (הצעות מחיר/חתימה) | `SALESFORCE_QUOTE_WEBHOOK_URL`, `SALESFORCE_WEBHOOK_SECRET`, `SALESFORCE_OUTBOUND_*` | מחובר |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | מחובר |
| נמעני ניהול | `MANAGEMENT_EMAILS` (אופציונלי לעקיפה) | ברירת-מחדל בקוד |

**לא לגעת בזה:** אין להגיש את אינטגרציית Canva לביקורת; אין לשמור refresh token ב-ENV; אין לשלוח מיילי-בדיקה לאנשים אמיתיים (במיוחד לא ל-eran@ldrsgroup.com).
