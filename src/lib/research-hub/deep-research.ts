/**
 * Wrapper around Gemini's Interactions API (Deep Research agent).
 *
 * Why we go async/poll:
 *  - Deep Research can take up to ~60min. We never hold a connection.
 *  - We start with `background: true, store: true`, persist the
 *    interaction id, then poll `interactions.get` from the workflow
 *    after a sleep. Each poll is one short serverless tick.
 */

import { geminiClient, MODELS } from "./gemini";

export type DRStatus =
  | "in_progress"
  | "requires_action"
  | "completed"
  | "failed"
  | "cancelled"
  | "incomplete";

export type DRSource = {
  url: string;
  title?: string;
  start?: number;
  end?: number;
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

  const client = ai as unknown as {
    interactions: {
      create: (params: Record<string, unknown>) => Promise<{ id: string; status: DRStatus }>;
    };
  };

  const tools: Array<Record<string, unknown>> = [
    { type: "google_search" },
    { type: "url_context" },
    { type: "code_execution" },
  ];
  if (opts.fileSearchStores?.length) {
    tools.push({ type: "file_search", file_search_store_names: opts.fileSearchStores });
  }

  const interaction = await client.interactions.create({
    agent: opts.agent ?? MODELS.deepResearch,
    input: lines.join("\n"),
    background: true,
    store: true,
    tools,
    agent_config: { type: "deep-research", thinking_summaries: "auto" },
  });

  return { id: interaction.id, status: interaction.status as DRStatus };
}

export async function getDeepResearch(interactionId: string) {
  const ai = geminiClient();
  const client = ai as unknown as {
    interactions: {
      get: (id: string) => Promise<{
        id: string;
        status: DRStatus;
        outputs?: Array<{
          type: string;
          text?: string;
          annotations?: Array<{
            type: string;
            url?: string;
            title?: string;
            start_index?: number;
            end_index?: number;
          }>;
        }>;
        usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
        error?: string;
      }>;
    };
  };
  return client.interactions.get(interactionId);
}

export async function cancelDeepResearch(interactionId: string) {
  const ai = geminiClient();
  const client = ai as unknown as {
    interactions: { cancel?: (id: string) => Promise<unknown>; delete?: (id: string) => Promise<unknown> };
  };
  if (client.interactions.cancel) return client.interactions.cancel(interactionId);
  if (client.interactions.delete) return client.interactions.delete(interactionId);
  throw new Error("interactions.cancel/delete not available on this SDK version");
}

export function extractFinalText(
  interaction: Awaited<ReturnType<typeof getDeepResearch>>,
): string {
  const outs = interaction.outputs ?? [];
  for (let i = outs.length - 1; i >= 0; i--) {
    if (outs[i].type === "text" && outs[i].text) return outs[i].text!;
  }
  return "";
}

export function extractSources(
  interaction: Awaited<ReturnType<typeof getDeepResearch>>,
): DRSource[] {
  const seen = new Map<string, DRSource>();
  for (const out of interaction.outputs ?? []) {
    if (out.type !== "text") continue;
    for (const a of out.annotations ?? []) {
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
  return Array.from(seen.values());
}

export function estimateCostCents(usage?: {
  input_tokens?: number;
  output_tokens?: number;
}): number {
  const inT = usage?.input_tokens ?? 0;
  const outT = usage?.output_tokens ?? 0;
  const dollars = (inT * 4) / 1_000_000 + (outT * 18) / 1_000_000;
  return Math.round(dollars * 100);
}
