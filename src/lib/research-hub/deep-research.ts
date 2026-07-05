/**
 * Wrapper around Gemini's Interactions API (Deep Research agent).
 *
 * Why we go async/poll:
 *  - Deep Research can take up to ~60min. We never hold a connection.
 *  - We start with `background: true, store: true`, persist the
 *    interaction id, then poll `interactions.get` from the workflow
 *    after a sleep. Each poll is one short serverless tick.
 *
 * Schema note (May/June 2026 breaking change):
 *  - The legacy Interactions request/response schema was removed on
 *    2026-06-08 (https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026).
 *  - We now use @google/genai >= 2.x native `ai.interactions`, which speaks
 *    the current schema. Results are read from the `steps` array (a
 *    structured timeline of `model_output` turns) instead of the old
 *    top-level `outputs` array.
 */

import { geminiClient, MODELS } from "./gemini";

export type DRStatus =
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete"
  | "budget_exceeded";

export type DRSource = {
  url: string;
  title?: string;
  start?: number;
  end?: number;
};

/**
 * The subset of the SDK's Interaction response we read. The SDK types these
 * as large discriminated unions; we narrow structurally on the `type` tag so
 * this stays resilient to non-breaking additions in the union.
 */
type DRAnnotation = {
  type?: string;
  url?: string;
  title?: string;
  start_index?: number;
  end_index?: number;
};
type DRContent = {
  type?: string;
  text?: string;
  annotations?: DRAnnotation[];
};
type DRStep = {
  type?: string;
  content?: DRContent[];
  error?: { message?: string; code?: number | string };
};
export type DRInteraction = {
  id: string;
  status: DRStatus;
  steps?: DRStep[];
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
  };
};

export async function startDeepResearch(opts: {
  topic: string;
  brief?: string;
  language?: "he" | "en";
  agent?: string;
  fileSearchStores?: string[];
}) {
  const ai = geminiClient();
  const lang = opts.language ?? "he";
  const lines = [
    `Topic: ${opts.topic}`,
    opts.brief ? `\nBrief from analyst:\n${opts.brief}` : "",
    "",
    "Produce a comprehensive market & brand intelligence report covering:",
    "1. Market sizing (TAM/SAM/SOM), growth rates, and segmentation",
    "2. Customer personas (3-5), demographics, psychographics, JTBD",
    "3. Competitive landscape — top 5-15 players: positioning, USP, share, strengths/weaknesses",
    "4. Pricing structures across tiers (premium / mid / discount), promotions",
    "5. Distribution channels — D2C, retail, marketplaces, partnerships",
    "6. Marketing strategies — channels, messaging, creative, KPIs where known",
    "7. Regulatory landscape and compliance requirements",
    "8. Cultural and consumer trends shaping demand",
    "9. Technology and innovation in the category",
    "10. Category-level SWOT",
    "11. Whitespace and unmet-need opportunities",
    "12. Strategic recommendations (5-8 concrete moves with rationale, risk, expected return)",
    "",
    `Output language: ${lang === "he" ? "Hebrew (עברית)" : "English"}.`,
    "Use precise numbers and inline source citations. Distinguish facts from interpretation. Quantify wherever possible.",
    "Where Israel-specific data is not available, fall back to global data and explicitly say so.",
  ].filter(Boolean);

  const tools: Array<Record<string, unknown>> = [
    { type: "google_search" },
    { type: "url_context" },
    { type: "code_execution" },
  ];
  if (opts.fileSearchStores?.length) {
    tools.push({ type: "file_search", file_search_store_names: opts.fileSearchStores });
  }

  const interaction = await ai.interactions.create({
    agent: opts.agent ?? MODELS.deepResearch,
    input: lines.join("\n"),
    background: true,
    store: true,
    tools: tools as never,
    agent_config: { type: "deep-research", thinking_summaries: "auto" },
  });

  return { id: interaction.id, status: interaction.status as DRStatus };
}

export async function getDeepResearch(interactionId: string): Promise<DRInteraction> {
  const ai = geminiClient();
  const interaction = await ai.interactions.get(interactionId);
  return interaction as unknown as DRInteraction;
}

export async function cancelDeepResearch(interactionId: string) {
  const ai = geminiClient();
  return ai.interactions.cancel(interactionId);
}

/** Pull the last `model_output` text from the interaction's step timeline. */
export function extractFinalText(interaction: DRInteraction): string {
  const steps = interaction.steps ?? [];
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].type !== "model_output") continue;
    const parts = steps[i].content ?? [];
    for (let j = parts.length - 1; j >= 0; j--) {
      if (parts[j].type === "text" && parts[j].text) return parts[j].text!;
    }
  }
  return "";
}

/** Collect unique url_citation annotations across all model_output steps. */
export function extractSources(interaction: DRInteraction): DRSource[] {
  const seen = new Map<string, DRSource>();
  for (const step of interaction.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const part of step.content ?? []) {
      if (part.type !== "text") continue;
      for (const a of part.annotations ?? []) {
        if (a.type === "url_citation" && a.url && !seen.has(a.url)) {
          seen.set(a.url, {
            url: a.url,
            title: a.title,
            start: a.start_index,
            end: a.end_index,
          });
        }
      }
    }
  }
  return Array.from(seen.values());
}

/** Surface the first step-level error message, if the interaction failed. */
export function extractError(interaction: DRInteraction): string | undefined {
  for (const step of interaction.steps ?? []) {
    if (step.error?.message) return step.error.message;
  }
  return undefined;
}

export function estimateCostCents(usage?: {
  total_input_tokens?: number;
  total_output_tokens?: number;
}): number {
  const inT = usage?.total_input_tokens ?? 0;
  const outT = usage?.total_output_tokens ?? 0;
  const dollars = (inT * 4) / 1_000_000 + (outT * 18) / 1_000_000;
  return Math.round(dollars * 100);
}
