import { GoogleGenAI } from "@google/genai";

let cached: GoogleGenAI | null = null;

export function geminiClient() {
  if (cached) return cached;
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  cached = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return cached;
}

export const MODELS = {
  // The publicly available Deep Research agent (per
  // https://ai.google.dev/gemini-api/docs/interactions). The "-max-" variant
  // is gated to allowlisted accounts and returns "unknown agent" otherwise;
  // override via GEMINI_DEEP_RESEARCH_MODEL if your account has Max access.
  deepResearch:
    process.env.GEMINI_DEEP_RESEARCH_MODEL ?? "deep-research-preview-04-2026",
  reasoning: process.env.GEMINI_REASONING_MODEL ?? "gemini-3.1-pro-preview",
  fast: process.env.GEMINI_FAST_MODEL ?? "gemini-3.1-flash-lite",
} as const;

/** Plain non-grounded reasoning — used for planning + synthesis + section drafting. */
export async function reason(opts: {
  prompt: string;
  systemInstruction?: string;
  responseSchema?: object;
  thinkingLevel?: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";
  model?: string;
}) {
  const ai = geminiClient();
  const model = opts.model ?? MODELS.reasoning;
  const res = await ai.models.generateContent({
    model,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.systemInstruction,
      thinkingConfig: opts.thinkingLevel
        ? { thinkingLevel: opts.thinkingLevel as never }
        : undefined,
      ...(opts.responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: opts.responseSchema as never,
          }
        : {}),
    },
  });
  return {
    text: res.text ?? "",
    raw: res,
  };
}
