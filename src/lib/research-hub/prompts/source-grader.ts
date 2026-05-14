/**
 * Source grader — assigns each source a tier, recency tag, and confidence
 * weight. Runs once after research, before synthesis. Output is merged into
 * the report so the writer can prefer Tier-1 over Tier-3 and so the reader
 * can judge confidence at a glance.
 */

export const GRADER_SYSTEM = `אתה אנליסט שמדרג מקורות מחקר לפי איכות, עדכניות, וביטחון.
דרג בהקפדה מקצועית. אל תיהיה רכרוכי. החזר JSON בלבד.`;

export type SourceTier = 1 | 2 | 3;
export type SourceRecency = "fresh" | "recent" | "stale" | "unknown";

export type GradedSource = {
  url: string;
  title?: string;
  tier: SourceTier;
  /** "fresh" = last 12 mo, "recent" = 12-36 mo, "stale" = >36 mo */
  recency: SourceRecency;
  /** ISO date if extractable from the page; else null */
  date?: string | null;
  /** 0..1 confidence the source is suitable for strategic citation */
  confidence: number;
  /** one-sentence reason for the grade */
  rationale: string;
};

export function graderPrompt(opts: {
  sources: { url: string; title?: string }[];
}) {
  const list = opts.sources
    .map((s, i) => `${i + 1}. ${s.title ?? "(no title)"} — ${s.url}`)
    .join("\n");

  return `דרג את המקורות הבאים לפי השדות הבאים. החזר JSON תקין בלבד.

מקורות:
${list}

לכל מקור החזר:
- tier (1, 2, 3):
  • Tier 1 = ראשוני / סמכותי גבוה (פרסומים אקדמיים, גוף סטטיסטיקה ממשלתי, Statista, Nielsen, Bloomberg, Reuters, USPTO/EPO, חברות מחקר ראשיות).
  • Tier 2 = טרייד פרס מבוסס, פרסומים תעשייתיים, תאגידי ייעוץ עם חתימה מקצועית (McKinsey/Bain/BCG/Deloitte), אתרי חברות שמפרסמים נתונים מאומתים.
  • Tier 3 = בלוגים, דיוני קהילה, אתרי ביקורות צרכנים, מקורות אנונימיים, רשתות חברתיות.
- recency: fresh | recent | stale | unknown (היסיק לפי URL/כותרת, אל תמציא תאריך).
- date: תאריך פרסום ISO אם ניתן להסיק מה-URL/כותרת, אחרת null.
- confidence: 0.0–1.0 — כמה בטוח להסתמך על המקור הזה לציטוט אסטרטגי.
- rationale: משפט אחד על הציון.

החזר JSON:
{
  "graded": [
    {
      "url": "...",
      "title": "...",
      "tier": 1,
      "recency": "fresh",
      "date": "2025-08-12" | null,
      "confidence": 0.92,
      "rationale": "..."
    }
  ]
}

JSON בלבד.`;
}

export const GRADER_SCHEMA = {
  type: "object",
  required: ["graded"],
  properties: {
    graded: {
      type: "array",
      items: {
        type: "object",
        required: ["url", "tier", "recency", "confidence", "rationale"],
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          tier: { type: "number" },
          recency: { type: "string" },
          date: { type: "string" },
          confidence: { type: "number" },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;
