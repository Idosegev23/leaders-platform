/**
 * Synthesizer / Writer — turns raw Deep Research output(s) into a structured
 * editorial-grade Hebrew report split into sections with source attribution.
 *
 * Each angle becomes ONE section in `sections`. The `recommendations` array
 * holds only the strategic recommendations angle. branding_recommendations
 * and labeling_recommendations are their own sections in `sections`.
 */

export const WRITER_SYSTEM = `אתה כותב דוחות אסטרטגיים בעברית ברמת קונסולטינג עילית (Leaders / McKinsey / BCG).
כללים:
- עברית רהוטה, חדה, קונקרטית. ללא קלישאות.
- כל טענה מספרית מלווה בציטוט מקור — באמצעות [n] שמפנה למקור ברשימה הסופית.
- מבנה אדיטוריאלי: כל סעיף נפתח ב-Lead משפט אחד, אחריו 2-4 פסקאות, אחר כך bullets, אחר כך טבלה אם רלוונטי.
- שיא של 9000 מילים בדוח כולו.
- החזר תמיד JSON תקין בלבד — ללא טקסט מקדים/סיומת.`;

export type ReportMode = "general" | "meeting_prep";

export function writerPrompt(opts: {
  topic: string;
  brief?: string;
  decision?: string;
  geography?: string;
  brandUrl?: string;
  brandName?: string;
  rawResearch: string;
  sources: { url: string; title?: string }[];
  language?: "he" | "en";
  /** When set, this is the second pass — include gap-fill data merged in. */
  isFollowupPass?: boolean;
  /** Switches the synthesizer to meeting-prep output (talking points, suggested questions). */
  mode?: ReportMode;
}) {
  const sourceList = opts.sources
    .map((s, i) => `[${i + 1}] ${s.title ?? s.url} — ${s.url}`)
    .join("\n");

  const isMeetingPrep = opts.mode === "meeting_prep";
  const meetingPrepHeader = isMeetingPrep
    ? `מצב פלט: הכנה לפגישה עסקית${opts.brandName ? ` עם המותג "${opts.brandName}"` : ""}.
הדוח נכתב לצוות הפיתוח העסקי של לידרס שייכנס לפגישה. הוא חייב לתת:
1) Snapshot של המותג בשורה אחת + 3-5 פרטים שחייבים להכיר לפני שנכנסים.
2) Talking points קונקרטיים שמראים שעשינו שיעורי בית (תאריכים, שמות קמפיינים, מספרים).
3) שאלות מומלצות לפגישה — שאלות פתוחות שמובילות לעסקה (לא כן/לא).
4) הזדמנויות ספציפיות שלידרס יכולה לעלות בפגישה (מה חסר להם שאנחנו נותנים).
חובה Israel-context. אם מצאת מקורות בעברית — תעדף אותם.

`
    : "";

  return `${meetingPrepHeader}נושא: ${opts.topic}
${opts.brandUrl ? `מותג בפוקוס: ${opts.brandUrl}\n` : ""}${opts.brandName && !opts.brandUrl ? `שם המותג: ${opts.brandName}\n` : ""}${opts.decision ? `ההחלטה שהמחקר אמור לעזור לקבל:\n${opts.decision}\n` : ""}${opts.brief ? `ברייף: ${opts.brief}\n` : ""}${opts.geography ? `גאוגרפיה: ${opts.geography}\n` : ""}
מקורות זמינים (השתמש במספור [n]):
${sourceList || "(אין מקורות מובנים — תוכל לצטט inline אם המחקר הגולמי מכיל URLs)"}

${opts.isFollowupPass ? "** זוהי הסינתזה השנייה לאחר לולאת ביקורת. שילבי את ממצאי השלמת-הפערים לתוך הדוח. הקפידי שבסעיפים שתוקנו אכן מופיעים הנתונים החדשים, ולא פסקאות גנריות. **\n\n" : ""}מחקר גולמי שנאסף:
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
  "sources_used": [1, 2, 3]${isMeetingPrep ? `,
  "meeting_prep": {
    "brand_snapshot": "פסקה אחת קצרה (3-5 משפטים) שמסבירה מי המותג, מה הוא מוכר ולמי, וגודל פעילותו — שיהיה ניתן לקרוא ב-30 שניות.",
    "must_know": ["פרט קריטי שאסור לפספס לפני הפגישה 1", "פרט 2", "..."],
    "talking_points": ["נקודת שיחה ספציפית עם תאריך/מספר/שם — מראה שעשינו שיעורי בית 1", "..."],
    "meeting_questions": ["שאלה פתוחה שמובילה לעסקה 1", "..."],
    "leaders_value_proposition": ["הזדמנות קונקרטית שלידרס יכולה להציע — מבוסס על פער ספציפי שזיהינו 1", "..."]
  }` : ""}
}

מבנה הסעיפים — שמור על הסדר הבא, השמט רק סעיפים שלא נחקרו כלל:
market_size → audience → trends → best_sellers → adjacent_categories → competition → pricing → cost_analysis → distribution → marketing → basket_growth → technology → customer_voice → regulation → israel_layer → frameworks → brand_deep_dive → brand_ideas → weak_signals → scenarios → contrarian_view → blind_spots → swot → opportunities → branding_recommendations → labeling_recommendations.

כל זווית = סעיף יחיד ב-sections. המערך recommendations מוקדש לסעיף recommendations בלבד (המלצות אסטרטגיות עליונות).
לכל סעיף עם נתונים מספריים — חובה key_numbers (3-6 ערכים).
לכל סעיף best_sellers / pricing / cost_analysis / brand_deep_dive / scenarios — חובה לפחות טבלה אחת ב-body_md.
בסעיפים contrarian_view / blind_spots / weak_signals — סטה מהפורמט הסטנדרטי לטובת חדות; bullets קצרים עם תאריכים ושמות.

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
    meeting_prep: {
      type: "object",
      properties: {
        brand_snapshot: { type: "string" },
        must_know: { type: "array", items: { type: "string" } },
        talking_points: { type: "array", items: { type: "string" } },
        meeting_questions: { type: "array", items: { type: "string" } },
        leaders_value_proposition: { type: "array", items: { type: "string" } },
      },
    },
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

  // ─── Meeting-prep mode extras (only present when mode = 'meeting_prep') ─
  meeting_prep?: {
    brand_snapshot: string;
    must_know: string[];
    talking_points: string[];
    meeting_questions: string[];
    leaders_value_proposition: string[];
  };

  // ─── Ultra-tier extras (added after the second synthesis) ─────────
  /** 12-15 most important numbers, structured. */
  stat_sheet?: import("./deliverables").StatSheet;
  /** ~150-word executive one-pager with top-3 + bottom line. */
  exec_brief?: import("./deliverables").ExecBrief;
  /** If-then logic mapping signals to actions. */
  decision_tree?: import("./deliverables").DecisionTree;
  /** Falsifiable hypotheses + cheap tests. */
  open_hypotheses?: import("./deliverables").OpenHypothesisList;
  /** Per-source quality grading. Indexed by URL. */
  graded_sources?: import("./source-grader").GradedSource[];
  /** Critic verdict on the first synthesis pass — kept for transparency. */
  critique?: import("./critic").Critique;
};
