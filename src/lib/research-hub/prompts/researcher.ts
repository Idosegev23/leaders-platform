import type { Angle } from "../angles";

export function researcherBrief(opts: {
  topic: string;
  geography?: string;
  angle: Angle;
  questions: string[];
  language?: "he" | "en";
}) {
  const lang = opts.language ?? "he";
  const langStr = lang === "he" ? "Hebrew (עברית)" : "English";

  return [
    `Topic: ${opts.topic}`,
    opts.geography ? `Geography: ${opts.geography}` : "",
    "",
    `Research angle: ${opts.angle.english} (${opts.angle.label})`,
    `Briefing: ${opts.angle.briefingHe}`,
    "",
    "Specific sub-questions to answer:",
    ...opts.questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Requirements:",
    "- Deliver an exhaustive, fact-dense report on this single angle.",
    "- Use precise numbers; cite the source for every non-trivial claim.",
    "- Distinguish primary research from analyst interpretation.",
    "- Where local (Israel) data is missing, fall back to comparable markets and explicitly say so.",
    "- Quantify wherever possible: market size, growth, share, prices, KPIs.",
    "",
    `Output language: ${langStr}.`,
    "Structure: short executive summary → numbered findings (each with sources) → key data tables in markdown → open questions.",
  ]
    .filter(Boolean)
    .join("\n");
}
