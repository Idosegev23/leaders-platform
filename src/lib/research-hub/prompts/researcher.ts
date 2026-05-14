import type { Angle } from "../angles";

export type ResearchMode = "general" | "meeting_prep";

export function researcherBrief(opts: {
  topic: string;
  geography?: string;
  brandUrl?: string;
  brandName?: string;
  decisionToHelp?: string;
  angle: Angle;
  questions: string[];
  language?: "he" | "en";
  /** Discriminator that shifts the researcher towards BD-meeting-readiness output when "meeting_prep". */
  mode?: ResearchMode;
}) {
  const lang = opts.language ?? "he";
  const langStr = lang === "he" ? "Hebrew (עברית)" : "English";
  const isMeetingPrep = opts.mode === "meeting_prep";
  const brandLine = opts.brandUrl
    ? `Brand under analysis: ${opts.brandUrl}${opts.brandName ? ` (${opts.brandName})` : ""} — when relevant for this angle, fetch this site directly (catalog, About, news), inspect product pages, prices and copy, and pull every public mention of the brand.`
    : opts.brandName
      ? `Brand under analysis: ${opts.brandName} — no website provided; pull every public mention (press, social, LinkedIn, news, marketplaces) and triangulate.`
      : "";
  const decisionLine = opts.decisionToHelp
    ? `Decision this research must help make: ${opts.decisionToHelp} — every finding should be evaluated for "does this change the decision?".`
    : "";

  const meetingPrepBlock = isMeetingPrep
    ? [
        "",
        "Mode: MEETING PREP for Leaders' BD team.",
        "This research will be read 15 minutes before a discovery / pitch meeting with the brand.",
        "Bias the findings towards what a BD lead needs to walk into that meeting credibly:",
        "  • What is the brand most proud of right now (recent wins, awards, launches, partnerships)?",
        "  • What is publicly known about their pain points (negative reviews, missed targets, leadership turnover, competitor wins)?",
        "  • Who are the visible decision-makers and what are their public stances/interests (LinkedIn, interviews, talks)?",
        "  • What does Leaders bring that the brand visibly lacks? (gaps in content, influencer activity, social presence, creative direction)",
        "  • Israel-context is REQUIRED — local consumers, local competitors, Hebrew search terms, Israeli media coverage.",
        "Capture concrete artifacts where possible: dates, names, exact campaign titles, exact monetary figures, real quotes.",
        "",
      ]
    : [];

  return [
    `Topic: ${opts.topic}`,
    opts.geography ? `Geography: ${opts.geography}` : "",
    brandLine,
    decisionLine,
    ...meetingPrepBlock,
    "",
    `Research angle: ${opts.angle.english} (${opts.angle.label})`,
    `Briefing: ${opts.angle.briefingHe}`,
    "",
    "Specific sub-questions to answer:",
    ...opts.questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    "Requirements — be EXHAUSTIVE on this single angle:",
    "- Drill all the way down to product/SKU/brand level. Generic category-level statements are NOT acceptable.",
    "- Use precise numbers (₪/$/units/%/years) with the source for every non-trivial claim.",
    "- Distinguish primary research (data you found) from analyst interpretation (your synthesis).",
    "- Where local (Israel) data is missing, fall back to comparable markets (US, UK, EU) and explicitly say so.",
    "- Quantify wherever possible: market size, growth, share, prices, KPIs, AOV, conversion, margins.",
    "- For best-sellers / pricing / cost / brand_deep_dive: ALWAYS produce a comparison table with named SKUs, prices and sources.",
    "- For recommendations / ideas: each item must reference a specific finding from your research (not generic best-practice).",
    "- Hunt for the small details that change decisions: edge cases, niche players, recent product launches, pricing anomalies, regulatory exceptions.",
    "",
    `Output language: ${langStr}.`,
    "Structure: short executive summary → numbered findings (each with sources) → key data tables in markdown → open questions.",
  ]
    .filter(Boolean)
    .join("\n");
}
