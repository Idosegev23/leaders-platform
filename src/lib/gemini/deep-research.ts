/**
 * Gemini Deep Research Agent — REST wrapper.
 *
 * Background: Google's Deep Research agent (`deep-research-preview-04-2026` /
 * `deep-research-max-preview-04-2026`) runs autonomous multi-step research
 * with built-in Google Search, URL Context, and Code Execution. Tasks take
 * 5-15 minutes typically. The Interactions API is mandatory `background=true`.
 *
 * The @google/genai SDK at v1.34 does not yet expose `interactions`, so this
 * wrapper hits the REST endpoint directly:
 *   POST https://generativelanguage.googleapis.com/v1beta/interactions
 *   GET  https://generativelanguage.googleapis.com/v1beta/interactions/<id>
 *
 * Vercel constraint: max function duration is 600s. We never block a single
 * function for the full research time. Instead callers either:
 *   1. Poll inline up to a tight timeout (e.g. 90s) and return partial
 *      status if not done — used for IMAI fallback where the user is
 *      waiting in the wizard.
 *   2. Start the interaction and persist the ID to Supabase. Client
 *      polls /api/deep-research/status separately. Used for the explicit
 *      "deep research mode" button.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/interactions'

function getApiKey(): string {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!k) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not configured')
  return k
}

export type DeepResearchAgent =
  | 'deep-research-preview-04-2026'      // ~5 min, $1-3
  | 'deep-research-max-preview-04-2026'  // ~15 min, $3-7

export interface DeepResearchInput {
  /** The natural-language task. Be specific — this drives all sub-steps. */
  prompt: string
  /** Default fast agent. Use 'max' for due-diligence-grade depth. */
  agent?: DeepResearchAgent
  /** Restrict tools — by default the agent has google_search, url_context, and code_execution. */
  tools?: Array<
    | { type: 'google_search' }
    | { type: 'url_context' }
    | { type: 'code_execution' }
  >
  /** Multimodal: pass document/image URIs alongside the text prompt. */
  attachments?: Array<{ type: 'document' | 'image'; uri: string; mimeType?: string }>
  /** Continue a prior interaction (e.g. answer a follow-up). */
  previousInteractionId?: string
  /** Enable thought summaries in streaming (we don't use streaming here). */
  thinkingSummaries?: 'auto' | 'none'
}

export interface DeepResearchInteraction {
  id: string
  status: 'in_progress' | 'completed' | 'failed' | 'queued'
  outputs?: Array<{ type: 'text' | 'image'; text?: string; data?: string }>
  error?: { code?: string; message?: string }
  createdAt?: string
}

/**
 * Start a Deep Research task. Returns immediately with an interaction id.
 * The actual research happens server-side; poll status separately.
 */
export async function startDeepResearch(input: DeepResearchInput): Promise<DeepResearchInteraction> {
  const requestId = `dr-start-${Date.now()}`
  const agent = input.agent || 'deep-research-preview-04-2026'

  // Build multi-modal input array if attachments are provided, otherwise plain text.
  const bodyInput = input.attachments?.length
    ? [
        { type: 'text', text: input.prompt },
        ...input.attachments.map((a) => ({
          type: a.type,
          uri: a.uri,
          ...(a.mimeType ? { mime_type: a.mimeType } : {}),
        })),
      ]
    : input.prompt

  const body: Record<string, unknown> = {
    agent,
    input: bodyInput,
    background: true,
    agent_config: {
      type: 'deep-research',
      thinking_summaries: input.thinkingSummaries || 'none',
      visualization: 'auto',
    },
  }
  if (input.tools?.length) body.tools = input.tools
  if (input.previousInteractionId) body.previous_interaction_id = input.previousInteractionId

  console.log(`[DeepResearch][${requestId}] Starting ${agent}, prompt=${input.prompt.length} chars, tools=${(input.tools || []).map(t => t.type).join('/') || 'default'}`)

  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': getApiKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deep Research start failed: HTTP ${res.status} — ${text.slice(0, 300)}`)
  }
  const json = await res.json() as DeepResearchInteraction
  console.log(`[DeepResearch][${requestId}] ✅ Started: ${json.id} (status=${json.status})`)
  return json
}

/** Single status poll. Returns whatever the server has (in_progress / completed / failed). */
export async function getDeepResearchStatus(interactionId: string): Promise<DeepResearchInteraction> {
  const res = await fetch(`${BASE}/${encodeURIComponent(interactionId)}`, {
    method: 'GET',
    headers: { 'x-goog-api-key': getApiKey() },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Deep Research status failed: HTTP ${res.status} — ${text.slice(0, 300)}`)
  }
  return res.json() as Promise<DeepResearchInteraction>
}

/**
 * Poll until completion or timeout. Use ONLY when the calling Vercel
 * function has time to spare (e.g. inline IMAI fallback in the wizard
 * where 60-90s is acceptable). For the explicit "deep mode" button,
 * use startDeepResearch() and let the client poll separately.
 *
 * Returns the full interaction. If timeoutMs elapses, returns the last
 * known status (likely still in_progress) — caller can check status.
 */
export async function pollUntilComplete(
  interactionId: string,
  opts: { timeoutMs: number; pollIntervalMs?: number },
): Promise<DeepResearchInteraction> {
  const interval = opts.pollIntervalMs ?? 5000
  const deadline = Date.now() + opts.timeoutMs
  let last: DeepResearchInteraction | null = null
  while (Date.now() < deadline) {
    last = await getDeepResearchStatus(interactionId)
    if (last.status === 'completed' || last.status === 'failed') return last
    await new Promise((r) => setTimeout(r, interval))
  }
  console.warn(`[DeepResearch] poll timeout after ${opts.timeoutMs}ms — last status: ${last?.status}`)
  return last ?? { id: interactionId, status: 'in_progress' }
}

/** Pull the final text output from a completed interaction (last text delta). */
export function extractText(interaction: DeepResearchInteraction): string {
  if (!interaction.outputs?.length) return ''
  const texts = interaction.outputs.filter((o) => o.type === 'text' && o.text)
  return texts[texts.length - 1]?.text || ''
}

/* ────────────────────────────────────────────────────────────────────
 * Domain-specific prompt builders
 * Each search agent gets a tight prompt that's tuned to its task.
 * ──────────────────────────────────────────────────────────────────── */

/**
 * Build the prompt for an Israeli-influencer discovery task. Used as the
 * IMAI fallback when no_tokens_remaining / quota exhausted.
 */
export function buildInfluencerSearchPrompt(opts: {
  brandName: string
  industry?: string
  targetAudience?: string
  goals?: string[]
  budget?: number
  count?: number
  excludeHandles?: string[]
}): string {
  const lines: string[] = []
  lines.push(`Find ${opts.count || 8} Israeli Instagram influencers who would be the best fit for a campaign for "${opts.brandName}".`)
  lines.push('')
  lines.push('## Brand context')
  if (opts.industry) lines.push(`- Industry: ${opts.industry}`)
  if (opts.targetAudience) lines.push(`- Target audience: ${opts.targetAudience}`)
  if (opts.goals?.length) lines.push(`- Campaign goals: ${opts.goals.join(', ')}`)
  if (opts.budget) lines.push(`- Budget: ₪${opts.budget.toLocaleString()}`)
  if (opts.excludeHandles?.length) lines.push(`- Already considered (skip these): ${opts.excludeHandles.join(', ')}`)

  lines.push('')
  lines.push('## Constraints')
  lines.push('- ISRAELI accounts only (primary audience must be in Israel — verify via Hebrew posts, Israeli locations, or explicit follower-base data).')
  lines.push('- Follower range: 30,000 – 500,000 (mid-tier, real engagement).')
  lines.push('- Active in 2025-2026 (recent posts).')
  lines.push('- No bots, no buy-followers signals.')
  lines.push('- Diversity: mix tiers (micro 30-100k, mid 100-300k, macro 300-500k) and at least 3 different content angles.')

  lines.push('')
  lines.push('## Output format — strict JSON only, no markdown:')
  lines.push('```json')
  lines.push('{')
  lines.push('  "influencers": [')
  lines.push('    {')
  lines.push('      "name": "Full name in Hebrew or English",')
  lines.push('      "handle": "instagram_handle (without @)",')
  lines.push('      "estimatedFollowers": 150000,')
  lines.push('      "tier": "micro|mid|macro",')
  lines.push('      "niche": "1-3 words describing their content angle",')
  lines.push('      "rationale": "1-2 sentences in Hebrew explaining why they fit this brand specifically",')
  lines.push('      "sourceUrls": ["https://… verifiable source"]')
  lines.push('    }')
  lines.push('  ],')
  lines.push('  "strategySummary": "2-3 sentence Hebrew strategy: which tiers, what content mix, expected behavior."')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push('Output ONLY the JSON object. No prose before or after. Verify each handle exists by searching for them on Instagram or via a Hebrew-language source.')
  return lines.join('\n')
}

/** Build the prompt for a deep brand-research task (Tier-2 brand research). */
export function buildBrandResearchPrompt(opts: {
  brandName: string
  websiteUrl?: string
  briefSnippet?: string
}): string {
  const lines: string[] = []
  lines.push(`Conduct a comprehensive market-research report on the brand "${opts.brandName}".`)
  if (opts.websiteUrl) lines.push(`Brand website: ${opts.websiteUrl}`)
  if (opts.briefSnippet) lines.push(`\nBrief context (provided by the agency):\n${opts.briefSnippet.slice(0, 1500)}`)
  lines.push('')
  lines.push('## Research scope')
  lines.push('1. Brand identity, history, positioning, and value proposition.')
  lines.push('2. Target demographics & psychographics in the Israeli market specifically.')
  lines.push('3. Top 3-5 competitors in Israel — what they do, where they win, where they lose.')
  lines.push('4. Industry benchmarks: typical CPE / engagement-rate / reach for the category in Israel 2025-2026.')
  lines.push('5. Brand voice & visual identity — tone, photography style, decorative aesthetic.')
  lines.push('6. Recent campaigns (24 months) the brand or competitors ran with influencers, with measurable outcomes when public.')
  lines.push('7. Strategic tensions: 3 honest tensions between what the brand claims, what consumers want, and what the market does.')
  lines.push('8. Visual DNA: photo style, product styling, decorative aesthetic, lighting mood, typography mood, recurring patterns.')
  lines.push('')
  lines.push('Output a structured Hebrew report with citations. Include a "Visual DNA" section near the end with the 6 fields above as a JSON code block so it can be parsed.')
  lines.push('Do not invent data — when something is unknown, say so explicitly.')
  return lines.join('\n')
}

/** Build the prompt for a deep competitive-campaign analysis. */
export function buildCompetitorCampaignPrompt(opts: {
  brandName: string
  industry: string
  competitors: string[]
}): string {
  return [
    `Analyze recent (24 months) influencer-marketing campaigns by "${opts.brandName}"'s direct competitors in the Israeli ${opts.industry} market.`,
    `Competitors: ${opts.competitors.join(', ')}.`,
    '',
    'For each competitor, find:',
    '1. The 1-2 most prominent campaigns they ran with influencers (date, hashtag, KPI claims if any).',
    '2. Specific Israeli influencers they collaborated with (names + handles).',
    '3. What appeared to work (engagement signals, virality, press) and what flopped.',
    '4. The clear opportunity gap our brand can exploit — be specific.',
    '',
    'Output Hebrew prose with embedded citations. Be concrete, not generic.',
  ].join('\n')
}
