# Leaders Hub ⇄ Salesforce — Integration Contract (Client Brief)

Status: **IMPLEMENTED on the Hub side** (2026-06-09). Both endpoints exist in
code. To go live we only need to (a) set the env vars below in Vercel,
(b) deploy, and (c) get the Salesforce-side endpoint + auth for Direction 2.
Built on the same pattern as the existing `/api/webhooks/clickup` receiver.

Production base URL (confirm before go-live; custom domain if any):
    https://leaders-platform.vercel.app

ENV VARS (set in Vercel before go-live):
  SALESFORCE_WEBHOOK_SECRET     required — secures Direction 1 + the pull GET.
  BRIEF_DEFAULT_SENDER_EMAIL    optional — fallback Leaders mailbox that sends the
                                brief email when no sender_email is given (must be a
                                user who connected Gmail in the Hub once).
  SALESFORCE_BRIEF_WEBHOOK_URL  optional — Direction-2 push target. Unset → no push
                                (use the pull GET instead).
  SALESFORCE_OUTBOUND_SECRET    optional — sent as `Authorization: Bearer ...` on the
                                Direction-2 push, if your endpoint requires it.

There are TWO directions:
  1. Salesforce → Hub : create a brief when project moves to "New brief".
  2. Hub → Salesforce : push the FULL brief back when the client submits it.

Auth (both directions): shared secret over HTTPS.
  - SF → Hub : header `Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>`
               (optional hardening: `x-signature` = HMAC-SHA256(rawBody, secret),
                exactly like our ClickUp webhook).
  - Hub → SF : we send whatever header/secret your endpoint requires — tell us.


================================================================================
DIRECTION 1 · SALESFORCE → HUB  ("New brief" → create + send brief link)
================================================================================
Endpoint (to be built):
    POST  https://leaders-platform.vercel.app/api/webhooks/salesforce/brief
    Content-Type: application/json
    Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>

What it does: creates a `client-brief` link for the client, emails them the
brief URL (from the sender's mailbox / system sender), and returns the token +
URL. The `salesforce_ref` you send is stored and echoed back on completion so
you can correlate.

--- Request body (SF sends) ---------------------------------------------------
  FIELD            TYPE      REQ   NOTES
  ---------------  --------  ----  ----------------------------------------------
  salesforce_ref   string    yes   Your Opportunity/Project Id. Echoed back on completion.
  client_name      string    yes   Client/brand name shown in the form + emails.
  client_email     string    yes   Recipient of the brief link.
  language         string    NO    "he" | "en". Default "he".
  sender_email     string    NO    Leaders mailbox that sends the link. Falls back to
                                    BRIEF_DEFAULT_SENDER_EMAIL, then to "create link only".
  sender_name      string    NO    Display name for the email.
  personal_note    string    NO    Free text added to the email body (max 2000).
  send_email       boolean   NO    Default true. false → create the link + return the
                                    URL WITHOUT emailing the client (you send it yourself).

  EXAMPLE:
  {
    "salesforce_ref": "006Ad000001AbCdEFG",
    "client_name": "נטורל גלואו קוסמטיקס",
    "client_email": "maya@naturalglow.co.il",
    "language": "he",
    "sender_email": "dana@leaders.co.il",
    "sender_name": "דנה לוי",
    "personal_note": "היי מאיה, נשמח שתמלאי את הבריף כדי שנתחיל לעבוד על הקמפיין."
  }

--- Response (Hub returns, 201) -----------------------------------------------
  {
    "ok": true,
    "token": "8f3c2b14-7e9a-4c1d-9f02-2a6b5d8e1c44",
    "brief_url": "https://leaders-platform.vercel.app/forms/client-brief?token=8f3c2b14-7e9a-4c1d-9f02-2a6b5d8e1c44",
    "status": "pending",
    "salesforce_ref": "006Ad000001AbCdEFG",
    "linked_lead_id": null,          // set if client_email matched an existing Hub lead
    "mail_delivery": "sent",         // "sent" | "skipped" | "failed"
    "mail_error": null               // reason when skipped/failed (e.g. "no_sender_mailbox_connected")
  }

  Errors: 401 invalid secret · 400 missing/invalid required field · 500 server error.
  Note: mail_delivery="skipped" is NOT an error — the link + brief_url are valid;
        it just means no Leaders mailbox was connected to send from.


================================================================================
DIRECTION 2 · HUB → SALESFORCE  (client submitted → full brief back)
================================================================================
Trigger: client finishes the 6-step form (link status → "completed").
Delivery — two options, both implemented:
  PUSH (default): Hub POSTs the envelope below to SALESFORCE_BRIEF_WEBHOOK_URL.
                  Headers: Content-Type: application/json, and
                  Authorization: Bearer <SALESFORCE_OUTBOUND_SECRET> if that env is set.
  PULL (alt):     GET https://leaders-platform.vercel.app/api/webhooks/salesforce/brief/{token}
                  Authorization: Bearer <SALESFORCE_WEBHOOK_SECRET>
                  Returns the exact same envelope. While unfinished, submission_data
                  is null and status is "pending"/"opened".
Tell us which you prefer (and your endpoint URL + auth if PUSH).

THIS IS THE FULL PAYLOAD, ALL FIELDS POPULATED (no placeholders).
Top-level = link metadata. `submission_data` = the 27 brief answers.

{
  "event": "brief.completed",
  "salesforce_ref": "006Ad000001AbCdEFG",
  "token": "8f3c2b14-7e9a-4c1d-9f02-2a6b5d8e1c44",
  "document_type": "client-brief",
  "status": "completed",
  "language": "he",

  "client_name": "נטורל גלואו קוסמטיקס",
  "client_email": "maya@naturalglow.co.il",
  "created_by_email": "dana@leaders.co.il",
  "created_by_name": "דנה לוי",

  "created_at": "2026-06-09T08:12:44.000Z",
  "opened_at": "2026-06-09T09:01:10.000Z",
  "completed_at": "2026-06-09T09:48:33.000Z",

  "brief_drive_doc_link": "https://docs.google.com/document/d/1AbC.../edit",

  "submission_data": {
    "date": "2026-06-09",
    "submitterName": "מאיה כהן",
    "clientName": "נטורל גלואו קוסמטיקס",
    "productService": "סדרת טיפוח פנים טבעית מבוססת רכיבים אורגניים",
    "services": ["ניהול משפיענים", "ניהול סושיאל", "קידום ממומן", "שירותי קריאטיב"],
    "platforms": ["אינסטגרם", "טיקטוק", "פייסבוק"],
    "campaignLaunchDate": "2026-07-15",

    "marketCategory": "שוק הקוסמטיקה הטבעית בישראל, קטגוריית טיפוח פנים פרימיום. שוק צומח עם מודעות גוברת למרכיבים נקיים.",
    "productDescription": "סדרת טיפוח פנים על בסיס שמנים אורגניים בכבישה קרה. הבשורה: יעילות קליני יחד עם 100% רכיבים טבעיים. ה-USP: ללא פרבנים, ללא בדיקות על בעלי חיים, ייצור מקומי.",
    "competitors": "מותגי טבע מקומיים (לאבדו, סבון של פעם) ומותגים בינלאומיים (The Ordinary). המתחרים נשענים על מחיר נמוך; אנחנו על איכות ואמינות מדעית.",
    "challenge": "להבדל בקטגוריה רוויה שבה כל מותג טוען ל'טבעי', ולבסס אמון אמיתי מול צרכן סקפטי.",

    "targetAudience": "נשים בנות 28-45, מודעות בריאות, מחפשות טיפוח אפקטיבי ונקי, בעלות כוח קנייה בינוני-גבוה.",
    "audienceCharacteristics": "גרות במרכז, פעילות באינסטגרם וטיקטוק, צורכות תוכן וולנס, רגישות לרכיבים, נאמנות למותגים שמייצרים ערכים.",
    "audienceInsights": "הן לא קונות 'טבעי' בגלל מילה על האריזה — הן רוצות הוכחה. תוכן חינוכי על רכיבים עובד עליהן יותר מפרסום ישיר.",

    "campaignGoalTypes": ["מודעות", "הנעה למכר", "נחשקות"],
    "campaignGoalsDescription": "להעלות מודעות למותג ב-40% בקרב קהל היעד תוך רבעון, ולהניע 1,500 רכישות ראשונות דרך קוד משפיענים.",
    "desiredResponse": "שהקהל ירגיש שהוא מצא סוף סוף מותג טבעי שאפשר לסמוך עליו, וייכנס לאתר לרכישה ראשונה.",
    "timingType": "רבעוני",
    "timingDetails": "השקה לקראת עונת הקיץ, דגש על הגנה והזנה לעור בחודשי החום.",

    "insight": "צרכניות 'נקיות' חוות תסכול: הן רוצות מוצר טבעי שבאמת עובד, אבל נשרפו מהבטחות שיווקיות ריקות.",
    "solution": "המותג שלנו מציג שקיפות מלאה — כל רכיב מוסבר, עם תוצאות בדוקות — וכך הופך את הספק לאמון.",
    "mainMessage": "טבעי שבאמת עובד — בלי פשרות ובלי הבטחות ריקות.",
    "keyTakeaway": "שיזכרו שזה המותג הטבעי היחיד שמראה לך בדיוק מה יש בפנים ולמה זה עובד.",

    "requirements": "Big idea לקמפיין, תסריט ל-3 סרטוני משפיענים, קונספט לסדרת תוכן חינוכי על רכיבים, ורעיונות לשת\"פ עם דיאטניות/מומחיות עור.",
    "campaignType": "קמפיין משולב: סדרת סרטוני משפיענים + תוכן UGC + פוסטים חינוכיים ממומנים.",
    "budget": "75,000₪",
    "notes": "פתוחים לשת\"פ עם 2-3 מאקרו-משפיעניות בתחום הוולנס. חשוב להימנע מטון שיווקי אגרסיבי."
  }
}

--- Field reference for submission_data ---------------------------------------
Full key/type/label table + controlled-vocabulary values (he↔en) is in:
    salesforce-client-brief-fields.txt
Quick reminder of non-obvious types:
  - services, platforms, campaignGoalTypes  → arrays of literal strings (always arrays)
  - timingType                              → single string from a fixed list
  - budget                                  → free text, NOT a number
  - dates                                   → "YYYY-MM-DD"
  - timingDetails, notes                    → optional (may be "" or absent)
  - values arrive in the client's chosen language (he by default; en if language="en")


================================================================================
OPEN QUESTIONS FOR THE SALESFORCE SIDE
================================================================================
1. Direction 2 delivery: do you expose a REST endpoint we POST to (give us URL +
   required auth header), or do you prefer to POLL our GET-by-token?
2. Auth: Bearer secret OK, or do you require HMAC / mTLS / OAuth2 client-creds?
3. salesforce_ref: is it the Opportunity Id, a Project record Id, or other?
   We store it verbatim and echo it back — confirm which object so the mapping is 1:1.
4. Retries: on Direction 2 we'll retry on non-2xx. Confirm your endpoint is idempotent
   on `token` (so a retry doesn't create duplicate records).
