/**
 * Extra deliverables for ultra-tier reports.
 * These run AFTER the second synthesis pass and produce executive-grade artifacts:
 *
 *   1. Stat Sheet — 10-15 most important numbers, structured.
 *   2. Exec One-Pager — ~250 words, 3 recommendations, for a CEO/CMO.
 *   3. Decision Tree — if-then logic mapping signals to actions.
 *   4. Open Hypotheses — explicit list of "things to validate in the field".
 *
 * Each is a separate JSON-mode reasoning call so the LLM can stay focused.
 */

import type { Report } from "./synthesizer";

const reportSummaryFor = (r: Report) =>
  JSON.stringify(
    {
      title: r.title,
      executive_summary: r.executive_summary,
      headline_findings: r.headline_findings,
      sections: r.sections.map((s) => ({
        id: s.id,
        title: s.title,
        lead: s.lead,
        body_preview: s.body_md.slice(0, 2200),
        key_numbers: s.key_numbers,
      })),
      recommendations: r.recommendations,
    },
    null,
    2,
  );

// ─── Stat Sheet ───────────────────────────────────────────────────────
export type StatSheet = {
  title: string;
  intro?: string;
  stats: Array<{
    label: string;
    value: string;
    unit?: string;
    /** Where in the report this comes from (section id). */
    source_section?: string;
    /** Reference index into the sources list. */
    source_ref?: number;
    /** "fact" | "estimate" | "range" — be honest. */
    kind: "fact" | "estimate" | "range";
    /** Why this number is one of the top 10-15. */
    why_it_matters: string;
  }>;
};

export const STAT_SHEET_SCHEMA = {
  type: "object",
  required: ["title", "stats"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    stats: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "value", "kind", "why_it_matters"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          unit: { type: "string" },
          source_section: { type: "string" },
          source_ref: { type: "number" },
          kind: { type: "string" },
          why_it_matters: { type: "string" },
        },
      },
    },
  },
} as const;

export function statSheetPrompt(opts: { topic: string; report: Report }) {
  return `נושא: ${opts.topic}

דוח מלא:
${reportSummaryFor(opts.report)}

המשימה: חלץ את 12-15 המספרים הכי חשובים בדוח ל-Stat Sheet. דרישות:
- כל מספר חייב לעלות מתוך הדוח (אל תמציא).
- ערב ערכים מסוגים שונים: גודל שוק, צמיחה, נתח, מחיר, מרג'ין, נתון לקוח, אות-חולשה.
- כל פריט מסומן kind = fact / estimate / range. סמן אסטמייט בכנות.
- why_it_matters במשפט אחד שמסביר למה זה אחד מהמספרים העליונים.

החזר JSON:
{
  "title": "כותרת לעמוד הסטטיסטיקה",
  "intro": "פסקה קצרה — מה רואים בעמוד הזה",
  "stats": [
    { "label": "...", "value": "...", "unit": "...", "source_section": "section_id", "kind": "fact", "why_it_matters": "..." }
  ]
}

JSON בלבד.`;
}

// ─── Exec One-Pager ───────────────────────────────────────────────────
export type ExecBrief = {
  title: string;
  /** ~120-180 words. The core narrative. */
  narrative_md: string;
  /** Top 3 recommendations, ordered by priority. */
  top_3: Array<{ title: string; one_liner: string; expected_impact: "low" | "medium" | "high" }>;
  /** "if you only remember 3 numbers" */
  numbers_to_remember: Array<{ label: string; value: string }>;
  /** The single sentence that answers the user's decision (if provided). */
  bottom_line: string;
};

export const EXEC_BRIEF_SCHEMA = {
  type: "object",
  required: ["title", "narrative_md", "top_3", "bottom_line"],
  properties: {
    title: { type: "string" },
    narrative_md: { type: "string" },
    top_3: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "one_liner"],
        properties: {
          title: { type: "string" },
          one_liner: { type: "string" },
          expected_impact: { type: "string" },
        },
      },
    },
    numbers_to_remember: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "value"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
        },
      },
    },
    bottom_line: { type: "string" },
  },
} as const;

export function execBriefPrompt(opts: {
  topic: string;
  decision?: string;
  report: Report;
}) {
  return `נושא: ${opts.topic}
${opts.decision ? `ההחלטה האחת שצריך לקבל:\n${opts.decision}\n` : ""}
דוח מלא:
${reportSummaryFor(opts.report)}

המשימה: כתוב One-Pager לסמנכ״ל בעברית — אובייקטיבי, חד, מכוון החלטה.

דרישות:
- narrative_md בין 120-180 מילים בלבד. לא יותר. לא קלישאות.
- top_3 = שלוש המלצות עליונות בלבד, ממוינות לפי priority. כל אחת עם one_liner של עד 18 מילים.
- numbers_to_remember = שלושה מספרים שאם המנכ״ל זוכר רק את אלה הוא במצב טוב.
- bottom_line = משפט אחד חד שמתייחס ישירות להחלטה (אם נתונה). אם אין החלטה, סכם את הצעד הבא.

החזר JSON תקין בלבד.`;
}

// ─── Decision Tree ────────────────────────────────────────────────────
export type DecisionTree = {
  title: string;
  /** The decision being structured. */
  question: string;
  branches: Array<{
    /** "If X is true / observed / decided…" */
    condition: string;
    /** What to do in that case. */
    action: string;
    /** Why this leads here, sourced from the report. */
    rationale: string;
    /** Sub-branches for nuance. */
    sub?: Array<{ condition: string; action: string }>;
    /** Risk level of this branch. */
    risk: "low" | "medium" | "high";
  }>;
  /** "If we go this route, here's how we'll know early if it's working/failing." */
  early_signals: Array<{ signal: string; meaning: string }>;
};

export const DECISION_TREE_SCHEMA = {
  type: "object",
  required: ["title", "question", "branches"],
  properties: {
    title: { type: "string" },
    question: { type: "string" },
    branches: {
      type: "array",
      items: {
        type: "object",
        required: ["condition", "action", "rationale"],
        properties: {
          condition: { type: "string" },
          action: { type: "string" },
          rationale: { type: "string" },
          risk: { type: "string" },
          sub: {
            type: "array",
            items: {
              type: "object",
              properties: {
                condition: { type: "string" },
                action: { type: "string" },
              },
            },
          },
        },
      },
    },
    early_signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          signal: { type: "string" },
          meaning: { type: "string" },
        },
      },
    },
  },
} as const;

export function decisionTreePrompt(opts: {
  topic: string;
  decision?: string;
  report: Report;
}) {
  return `נושא: ${opts.topic}
${opts.decision ? `ההחלטה האחת שצריך לקבל:\n${opts.decision}\n` : ""}
דוח מלא:
${reportSummaryFor(opts.report)}

המשימה: בנה Decision Tree אופרטיבי בעברית.

- אם נתונה החלטה — עץ סביב ההחלטה הזו (4-7 ענפים).
- אם לא — עץ סביב "מה הצעד הבא הנכון" שעולה מהמחקר.
- כל ענף = condition + action + rationale (קצר, מבוסס על נתון מהדוח) + risk.
- 2-3 ענפים מרכזיים יכולים לכלול sub-branches (תנאי שני).
- early_signals = 3-5 אותות מקדימים שיגלו לנו מוקדם אם בחרנו נכון או טעינו.

החזר JSON תקין בלבד.`;
}

// ─── Open Hypotheses ──────────────────────────────────────────────────
export type OpenHypothesisList = {
  intro?: string;
  hypotheses: Array<{
    /** A falsifiable statement we believe but haven't proven. */
    statement: string;
    /** How to test it cheaply. */
    cheap_test: string;
    /** What outcome would confirm vs. refute it. */
    decision_rule: string;
    /** "high impact" hypotheses change strategy if disproven. */
    impact_if_wrong: "low" | "medium" | "high";
    /** rough cost in time/money. */
    test_cost: "low" | "medium" | "high";
  }>;
};

export const OPEN_HYPOTHESES_SCHEMA = {
  type: "object",
  required: ["hypotheses"],
  properties: {
    intro: { type: "string" },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        required: ["statement", "cheap_test", "decision_rule"],
        properties: {
          statement: { type: "string" },
          cheap_test: { type: "string" },
          decision_rule: { type: "string" },
          impact_if_wrong: { type: "string" },
          test_cost: { type: "string" },
        },
      },
    },
  },
} as const;

export function openHypothesesPrompt(opts: {
  topic: string;
  decision?: string;
  report: Report;
}) {
  return `נושא: ${opts.topic}
${opts.decision ? `ההחלטה האחת:\n${opts.decision}\n` : ""}
דוח מלא:
${reportSummaryFor(opts.report)}

המשימה: זהה את 5-8 ההיפותזות החזקות ביותר שהדוח מניח אבל לא הוכיח לחלוטין. לכל אחת ספק:
- statement — היפותזה falsifiable (אפשר להפריך אותה).
- cheap_test — דרך זולה (פחות מ-10 ימים, פחות מ-5,000₪) לבדוק אותה בשטח.
- decision_rule — תוצאה X = אישוש, תוצאה Y = הפרכה.
- impact_if_wrong — low/medium/high.
- test_cost — low/medium/high.

מטרה: לתת לצוות רשימת ניסויים מעשיים לפני שהם משקיעים גדול. JSON בלבד.`;
}
