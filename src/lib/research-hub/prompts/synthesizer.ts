/**
 * Synthesizer / Writer — turns raw Deep Research output(s) into a structured
 * editorial-grade Hebrew report split into sections with source attribution.
 */

export const WRITER_SYSTEM = `אתה כותב דוחות אסטרטגיים בעברית ברמת קונסולטינג עילית (Leaders / McKinsey / BCG).
כללים:
- עברית רהוטה, חדה, קונקרטית. ללא קלישאות.
- כל טענה מספרית מלווה בציטוט מקור — באמצעות [n] שמפנה למקור ברשימה הסופית.
- מבנה אדיטוריאלי: כל סעיף נפתח ב-Lead משפט אחד, אחריו 2-4 פסקאות, אחר כך bullets, אחר כך טבלה אם רלוונטי.
- שיא של 7000 מילים בדוח כולו.
- החזר תמיד JSON תקין בלבד — ללא טקסט מקדים/סיומת.`;

export function writerPrompt(opts: {
  topic: string;
  brief?: string;
  geography?: string;
  rawResearch: string;
  sources: { url: string; title?: string }[];
  language?: "he" | "en";
}) {
  const sourceList = opts.sources
    .map((s, i) => `[${i + 1}] ${s.title ?? s.url} — ${s.url}`)
    .join("\n");

  return `נושא: ${opts.topic}
${opts.brief ? `ברייף: ${opts.brief}\n` : ""}${opts.geography ? `גאוגרפיה: ${opts.geography}\n` : ""}
מקורות זמינים (השתמש במספור [n]):
${sourceList || "(אין מקורות מובנים — תוכל לצטט inline אם המחקר הגולמי מכיל URLs)"}

מחקר גולמי שנאסף:
"""
${opts.rawResearch.slice(0, 380_000)}
"""

המשימה: ערוך את המחקר הגולמי לדוח קונסולטינג עברי ברמה הגבוהה ביותר. החזר JSON עם המבנה:

{
  "title": "כותרת מלאה לדוח",
  "subtitle": "תת-כותרת (משפט אחד)",
  "executive_summary": "תקציר מנהלים (3-5 פסקאות מאפיינות, מסרים מרכזיים, עם מספרים)",
  "headline_findings": ["ממצא חד 1", "ממצא חד 2"],
  "sections": [
    {
      "id": "<angle_id>",
      "title": "כותרת הסעיף",
      "lead": "משפט פתיחה אחד מסכם",
      "body_md": "תוכן מלא ב-Markdown (כותרות משנה, פסקאות, רשימות, טבלאות). השתמש ב-[n] לציטוטים.",
      "key_numbers": [{ "label": "תווית", "value": "ערך עם יחידה", "source": 1 }]
    }
  ],
  "recommendations": [
    {
      "title": "כותרת ההמלצה",
      "rationale_md": "למה — מבוסס על הנתונים מהדוח.",
      "playbook_md": "איך לבצע — מהלכים קונקרטיים.",
      "horizon": "0-3 חודשים | 3-12 חודשים | 12+ חודשים",
      "risk": "low | medium | high",
      "expected_impact": "low | medium | high"
    }
  ],
  "open_questions": ["שאלה פתוחה שלא נענתה"],
  "sources_used": [1, 2, 3]
}

מבנה הסעיפים — פתח את הסדר עם: market_size, audience, competition, pricing, distribution, marketing, regulation, trends, technology, swot, opportunities. ההמלצות נפרדות (recommendations).
החזר JSON תקין בלבד — ללא Markdown wrapping (לא \`\`\`json), ללא טקסט מקדים.`;
}

export const REPORT_SCHEMA = {
  type: "object",
  required: ["title", "executive_summary", "sections", "recommendations"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    executive_summary: { type: "string" },
    headline_findings: { type: "array", items: { type: "string" } },
    sections: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "body_md"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          lead: { type: "string" },
          body_md: { type: "string" },
          key_numbers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string" },
                source: { type: "number" },
              },
            },
          },
        },
      },
    },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "rationale_md", "playbook_md"],
        properties: {
          title: { type: "string" },
          rationale_md: { type: "string" },
          playbook_md: { type: "string" },
          horizon: { type: "string" },
          risk: { type: "string" },
          expected_impact: { type: "string" },
        },
      },
    },
    open_questions: { type: "array", items: { type: "string" } },
    sources_used: { type: "array", items: { type: "number" } },
  },
} as const;

export type Report = {
  title: string;
  subtitle?: string;
  executive_summary: string;
  headline_findings?: string[];
  sections: Array<{
    id: string;
    title: string;
    lead?: string;
    body_md: string;
    key_numbers?: Array<{ label: string; value: string; source?: number }>;
  }>;
  recommendations: Array<{
    title: string;
    rationale_md: string;
    playbook_md: string;
    horizon?: string;
    risk?: string;
    expected_impact?: string;
  }>;
  open_questions?: string[];
  sources_used?: number[];
};
