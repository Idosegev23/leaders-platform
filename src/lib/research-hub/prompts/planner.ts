import type { AngleId } from "../angles";
import { ANGLES, getAngles } from "../angles";

export const PLANNER_SYSTEM = `אתה אנליסט מחקר אסטרטגי בכיר עם ניסיון בקונסולטינג מותגים (BCG/McKinsey-grade).
תפקידך: לפרק נושא מחקר לתוכנית עבודה מובנית בעברית.
ענה תמיד ב-JSON תקין בלבד, ללא טקסט מקדים או סיומת.`;

export function plannerPrompt(opts: {
  topic: string;
  brief?: string;
  angles: AngleId[];
}) {
  const angles = getAngles(opts.angles).length
    ? getAngles(opts.angles)
    : ANGLES;
  const angleSpec = angles
    .map((a) => `- ${a.id} (${a.label}): ${a.briefingHe}`)
    .join("\n");

  return `נושא המחקר: ${opts.topic}
${opts.brief ? `\nברייף נוסף מהאנליסט:\n${opts.brief}\n` : ""}
זוויות מחקר נדרשות:
${angleSpec}

החזר JSON שיתאר תוכנית מחקר. למבנה:
{
  "title": "כותרת לדוח (3-8 מילים)",
  "executive_intent": "פסקה אחת — מה השואל באמת רוצה לדעת ולמה (2-4 משפטים)",
  "geography": "ישראל | גלובלי | ...",
  "language": "he",
  "sub_questions": [
    { "angle": "<angle_id>", "questions": ["שאלה 1", "שאלה 2", "שאלה 3"] }
  ],
  "must_know_facts": ["עובדה קריטית 1", "עובדה קריטית 2", ...]
}

לכל זווית, ספק 4-7 שאלות-משנה ספציפיות שמכוונות לקבלת מידע מספרי וקונקרטי.
החזר JSON תקין בלבד.`;
}

export const PLAN_SCHEMA = {
  type: "object",
  required: ["title", "executive_intent", "geography", "sub_questions"],
  properties: {
    title: { type: "string" },
    executive_intent: { type: "string" },
    geography: { type: "string" },
    language: { type: "string" },
    sub_questions: {
      type: "array",
      items: {
        type: "object",
        required: ["angle", "questions"],
        properties: {
          angle: { type: "string" },
          questions: { type: "array", items: { type: "string" } },
        },
      },
    },
    must_know_facts: { type: "array", items: { type: "string" } },
  },
} as const;
