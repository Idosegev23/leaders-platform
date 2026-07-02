import type { AngleId } from "../angles";
import { ANGLES, getAngles } from "../angles";

export const PLANNER_SYSTEM = `אתה ראש מחקר. אתה מפרק נושא לתוכנית חקירה *שאפשר לבצע* — לא לרשימת שאלות כללית.
כל שאלה שאתה מנסח היא אופרטיבית: ספציפית לרמת SKU/מוצר, מכומתת במספרים, מזכירה מתחרה בשם, ולפחות אחת בכל זווית יורדת אל מה שכולם מפספסים.
ענה תמיד ב-JSON תקין בלבד, ללא טקסט מקדים או סיומת.`;

export function plannerPrompt(opts: {
  topic: string;
  brief?: string;
  brandUrl?: string;
  decisionToHelp?: string;
  angles: AngleId[];
}) {
  const angles = getAngles(opts.angles).length
    ? getAngles(opts.angles)
    : ANGLES;
  const angleSpec = angles
    .map((a) => `- ${a.id} (${a.label}): ${a.briefingHe}`)
    .join("\n");

  return `נושא המחקר: ${opts.topic}
${opts.decisionToHelp ? `\nההחלטה האחת שהמחקר אמור לעזור לקבל:\n${opts.decisionToHelp}\nכל שאלה במחקר חייבת לתרום במישרין או בעקיפין להחלטה הזו.\n` : ""}${opts.brandUrl ? `\nאתר המותג שצריך לחקור לעומק: ${opts.brandUrl}\nכל זווית שמסומנת needsBrandUrl חייבת לשלב חקירה ישירה של האתר הזה (קטלוג, מחירים, About, חדשות) ואיתור כל המידע הציבורי על המותג.\n` : ""}${opts.brief ? `\nברייף נוסף מהאנליסט:\n${opts.brief}\n` : ""}
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

לכל זווית, ספק 5-8 שאלות-משנה שאפשר לבצע. דרישות לכל שאלה:
- רמת SKU/מוצר/מותג ספציפית כשרלוונטי — לא "הקטגוריה" ולא ברמה כללית.
- כימות מספרי (₪/$/יחידות/אחוזים/שנים).
- השוואה למתחרה *בשם* (לא "המתחרים" באופן כללי).
- אם המשתמש סיפק brand_url — שאלות בזווית brand_deep_dive ו-brand_ideas חייבות לכלול חקירה ישירה של האתר.
- לפחות שאלה אחת "מתחת לרדאר" לכל זווית — מה שכולם מפספסים (ניואנס, חריג, קצה).
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
