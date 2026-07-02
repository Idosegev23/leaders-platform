/**
 * Critic / gap-detector — runs after the first synthesis pass.
 * Reads the draft report and identifies the 5-8 most important thin spots
 * that warrant a follow-up Deep Research interaction.
 *
 * The critic is told to be HONEST, not encouraging. Generic gaps ("more
 * data on X") are rejected — every gap must come with a concrete query
 * that a Deep Research agent can act on.
 */

import type { Report } from "./synthesizer";

export const CRITIC_SYSTEM = `אתה מבקר אדוורסרי. תפקידך לשבור את הדוח, לא לאשר אותו.
אתה לא מנומס. אתה מזהה איפה הדוח רך, ספקולטיבי, גנרי או חסר ראיות, ומציין את המקום בדיוק.
לעולם אל תיתן "strong" אם נשאר ולו פער מהותי אחד לא מכוסה.
החזר תמיד JSON תקין בלבד.`;

export function criticPrompt(opts: {
  topic: string;
  brandUrl?: string;
  decision?: string;
  report: Report;
}) {
  const reportSummary = JSON.stringify(
    {
      title: opts.report.title,
      executive_summary: opts.report.executive_summary,
      sections: opts.report.sections.map((s) => ({
        id: s.id,
        title: s.title,
        lead: s.lead,
        body_preview: s.body_md.slice(0, 1500),
        has_numbers: !!s.key_numbers?.length,
      })),
      recommendations_count: opts.report.recommendations.length,
    },
    null,
    2,
  );

  return `נושא: ${opts.topic}
${opts.brandUrl ? `מותג בפוקוס: ${opts.brandUrl}\n` : ""}${opts.decision ? `ההחלטה האחת שהמחקר אמור לעזור לקבל:\n${opts.decision}\n` : ""}
דוח טיוטה (תקציר):
${reportSummary}

המשימה: נסה לשבור את הדוח. זהה את 5-8 הפערים הקריטיים ביותר בו. פער = מקום שבו ההמלצה לא מבוססת מספיק, נתון חסר, טענה ספקולטיבית, סעיף גנרי, סתירה שהוחלקה, או שאלה שלא נענתה ושצריכה להישאל.

לכל פער ספק:
1. section_id (אם רלוונטי) — איזה סעיף בדוח חלש
2. severity — "critical" | "high" | "medium"
3. gap_description — מה חסר/חלש (1-2 משפטים)
4. why_it_matters — איך זה משפיע על ההחלטה
5. followup_query — שאלה צרה, אופרטיבית, שמתאימה ל-Deep Research agent. חייבת להיות צרה מספיק שאפשר לענות עליה ב-30 דק' מחקר ממוקד. אסור "תן לי יותר על X" — נדרש שם של חברה/מוצר/סגמנט/תאריך/מספר ספציפי.

החזר JSON:
{
  "verdict": "weak | acceptable | strong",
  "headline_problem": "המשפט האחד שמסכם איפה הדוח הכי חלש",
  "gaps": [
    {
      "section_id": "string",
      "severity": "critical | high | medium",
      "gap_description": "string",
      "why_it_matters": "string",
      "followup_query": "string"
    }
  ]
}

verdict: אל תיתן "strong" אם נשאר ולו פער מהותי אחד לא מכוסה.
החזר 5-8 פערים. אל תמציא — פער חייב לעלות ממשהו אמיתי בדוח. JSON תקין בלבד.`;
}

export const CRITIC_SCHEMA = {
  type: "object",
  required: ["verdict", "gaps"],
  properties: {
    verdict: { type: "string" },
    headline_problem: { type: "string" },
    gaps: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "gap_description", "followup_query"],
        properties: {
          section_id: { type: "string" },
          severity: { type: "string" },
          gap_description: { type: "string" },
          why_it_matters: { type: "string" },
          followup_query: { type: "string" },
        },
      },
    },
  },
} as const;

export type Critique = {
  verdict: "weak" | "acceptable" | "strong";
  headline_problem?: string;
  gaps: Array<{
    section_id?: string;
    severity: "critical" | "high" | "medium";
    gap_description: string;
    why_it_matters?: string;
    followup_query: string;
  }>;
};
