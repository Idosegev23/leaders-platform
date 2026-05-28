/**
 * Management-facing AI summary of a completed client brief.
 *
 * The raw submission has 25+ fields. Management doesn't want to read them —
 * they want a 30-second exec summary: what does the client want, where's the
 * opportunity, and what should the team be careful about. This module asks
 * Gemini 3.1 Pro to produce that.
 *
 * Returns `null` if the model call fails — the caller falls back to the
 * legacy hand-picked field preview so the mail still goes out.
 */

import { callAI } from '@/lib/ai-provider'

export interface BriefMgmtSummary {
  /** One-sentence headline (≤ 15 words). */
  headline: string
  /** Structured key/value rows — only fields the brief actually contained. */
  bullets: Array<{ label: string; value: string }>
  /** Items needing extra attention: unrealistic ask, tight deadline, sensitivity, etc. Empty if brief is clean. */
  attention: string[]
}

export async function summariseBriefForMgmt(
  submission: Record<string, unknown>,
  language: 'he' | 'en' = 'he',
): Promise<BriefMgmtSummary | null> {
  const fieldsBlock = Object.entries(submission)
    .map(([k, v]) => {
      const val = Array.isArray(v)
        ? v.filter(Boolean).join(', ')
        : typeof v === 'string' || typeof v === 'number'
          ? String(v)
          : ''
      const trimmed = val.toString().trim()
      if (!trimmed) return null
      return `${k}: ${trimmed}`
    })
    .filter(Boolean)
    .join('\n')

  if (!fieldsBlock) return null

  // Today's date must be passed into the prompt — Gemini's training cutoff is
  // earlier, so without this it misjudges what counts as a "far-future" date.
  // (E.g. a launch in May 2026 was flagged as suspiciously far when in fact
  // today IS May 2026.)
  const today = new Date().toISOString().slice(0, 10)
  const prompt = language === 'en' ? buildEnglishPrompt(fieldsBlock, today) : buildHebrewPrompt(fieldsBlock, today)

  try {
    const result = await callAI({
      model: 'gemini-3.1-pro-preview',
      prompt,
      geminiConfig: {
        responseMimeType: 'application/json',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        thinkingConfig: { thinkingLevel: 'HIGH' as any },
      },
      thinkingLevel: 'HIGH',
      callerId: 'brief-mgmt-summary',
    })
    const text = (result.text || '').trim()
    if (!text) return null
    const parsed = JSON.parse(text) as Partial<BriefMgmtSummary>
    if (typeof parsed.headline !== 'string' || !Array.isArray(parsed.bullets)) return null
    const bullets = parsed.bullets
      .filter((b): b is { label: string; value: string } =>
        !!b && typeof b.label === 'string' && typeof b.value === 'string' && !!b.value.trim(),
      )
      .map((b) => ({ label: b.label.trim(), value: b.value.trim() }))
    const attention = Array.isArray(parsed.attention)
      ? parsed.attention.filter((a): a is string => typeof a === 'string' && !!a.trim()).map((a) => a.trim())
      : []
    return { headline: parsed.headline.trim(), bullets, attention }
  } catch (e) {
    console.warn('[brief-mgmt-summary] AI summary failed:', e instanceof Error ? e.message : e)
    return null
  }
}

function buildHebrewPrompt(fields: string, today: string): string {
  return `אתה כותב סיכום קצר להנהלת סוכנות פרסום על בריף שלקוח הרגע מילא.
המטרה: 30 שניות קריאה — מנהלי הסוכנות פותחים את המייל ומיד יודעים מה הלקוח רוצה.

התאריך היום: ${today}. כשאתה מעריך תאריכים בבריף, השווה אותם ל-${today} ולא להנחות פנימיות שלך.

הנה השדות שמילא הלקוח (key: value):

${fields}

החזר JSON בפורמט הבא בדיוק:
{
  "headline": "משפט אחד שמסכם מה הלקוח רוצה (עד 15 מילים, עברית, ישיר, ללא קלישאות)",
  "bullets": [
    {"label": "מותג", "value": "..."},
    {"label": "מטרה", "value": "..."},
    {"label": "קהל יעד", "value": "..."},
    {"label": "תקציב", "value": "..."},
    {"label": "טיימינג", "value": "..."},
    {"label": "אתגר מרכזי", "value": "..."},
    {"label": "תובנה / זווית", "value": "..."}
  ],
  "attention": []
}

כללים על bullets:
- כל value עד 20 מילים, ישיר, ללא קישוטים, ללא חזרה על המילה ב-label.
- אם הבריף לא מכיל מידע על שדה מסוים — השמט את ה-bullet הזה לגמרי (אל תמציא ואל תכתוב "לא צוין").

כללים על attention (חשוב מאוד — הסף גבוה):
- ברירת המחדל היא מערך ריק []. כך תחזיר ברוב הבריפים.
- attention זה לא רשימת נקודות מהבריף — זה רשימת התראות שדורשות שיקול דעת אנושי מיידי.
- מה לא להחזיר ב-attention (אלה דברים נורמליים, לא alerts):
  • "תקציב פתוח / לא מוגדר / תלוי בהיקף" — זה סטנדרט בבריפים, לא alert.
  • הזכרת תוצרים בתוך הסקופ (פודקאסט, ימי צילום, הפקה) — זה תוכן הבריף, לא alert.
  • תאריך השקה עתידי, גם אם הוא חודשים קדימה — זה סטנדרט, לא alert. השווה ל-${today} לפני שאתה קובע "רחוק".
  • פעילות שנתית / מתמשכת — זה סטנדרט.
  • הצעה למכירה רוחבית מצד שלך ("הזדמנות להציע X נוסף") — לא attention. המכירה היא של ההנהלה לא שלך.
- מה כן להחזיר ב-attention (רק אם זה ממש ברור מהבריף):
  • סתירה פנימית בבריף (למשל "תקציב 5,000₪" וגם "השקה ארצית רב-ערוצית").
  • דדליין שכבר חלף או שיחלוף תוך פחות מ-7 ימים מ-${today}.
  • איסור או רגישות שהלקוח ציין במפורש ("אסור לעבוד עם X", "תוכן רגיש מבחינה רגולטורית").
  • מתחרה ישיר ומסוכן שהלקוח שמו בשם.
  • דרישה לא חוקית / לא אפשרית.

הנחיות פורמט:
- כל הטקסט בעברית, ללא אנגלית מעורבבת.
- אל תוסיף שדות שלא בסכמה.
- במקרה של ספק לגבי attention — השמט אותו.`
}

function buildEnglishPrompt(fields: string, today: string): string {
  return `You are writing a 30-second executive summary for the management of a marketing agency about a brief a client just filled out.
Goal: management opens the mail and instantly knows what the client wants.

Today's date: ${today}. When evaluating dates in the brief, compare them to ${today}, not to internal assumptions.

Client-filled fields (key: value):

${fields}

Return JSON in exactly this format:
{
  "headline": "one sentence (≤ 15 words) describing what the client wants — direct, no fluff",
  "bullets": [
    {"label": "Brand", "value": "..."},
    {"label": "Goal", "value": "..."},
    {"label": "Audience", "value": "..."},
    {"label": "Budget", "value": "..."},
    {"label": "Timing", "value": "..."},
    {"label": "Core challenge", "value": "..."},
    {"label": "Angle / insight", "value": "..."}
  ],
  "attention": []
}

Bullet rules:
- Each value ≤ 20 words, direct, no fluff, no echoing the label word.
- If the brief doesn't contain info for a field — omit that bullet entirely (don't invent, don't write "not specified").

Attention rules (important — bar is HIGH):
- Default is an empty array []. That's what you should return for most briefs.
- attention is NOT a list of points from the brief — it's a list of alerts that need immediate human judgement.
- What NOT to put in attention (these are normal brief content, not alerts):
  • "Open / TBD / scope-dependent budget" — that's standard, not an alert.
  • Deliverables inside the scope (podcast, shoot days, production) — that's brief content, not an alert.
  • Future launch date, even months out — standard. Compare to ${today} before calling it "far".
  • Annual / ongoing activity — standard.
  • Cross-sell suggestions from your side — not your call to flag opportunities.
- What TO put in attention (only when clearly present in the brief):
  • Internal contradiction in the brief (e.g. "₪5,000 budget" + "national multi-channel launch").
  • Deadline already past, or less than 7 days away from ${today}.
  • A restriction or sensitivity the client explicitly named.
  • A direct, dangerous competitor named by name.
  • An illegal or impossible requirement.

Format:
- All text in English.
- No fields outside the schema.
- When in doubt about an attention item — omit it.`
}
