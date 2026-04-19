/**
 * Global AI Provider Switcher
 *
 * When Gemini returns 503, flips a global flag so ALL subsequent AI calls
 * in the current pipeline go to Claude Opus 4.6 — no repeated 503 checks.
 */

import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'

// ─── Singleton state ───────────────────────────────────────────────
let _useClaudeFallback = false
let _switchedAt: number | null = null

const geminiClient = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  httpOptions: { timeout: 540_000 },
})

let _anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }
  return _anthropicClient
}

// ─── Public API ────────────────────────────────────────────────────

/** Check if we're currently using Claude fallback */
export function isUsingClaude(): boolean {
  return _useClaudeFallback
}

/** Get info about the switch (for logging / frontend) */
export function getProviderStatus(): { provider: 'gemini' | 'claude'; switchedAt: number | null } {
  return { provider: _useClaudeFallback ? 'claude' : 'gemini', switchedAt: _switchedAt }
}

/** Force switch to Claude (called when 503 detected) */
export function switchToClaude(reason: string): void {
  if (_useClaudeFallback) return // already switched
  _useClaudeFallback = true
  _switchedAt = Date.now()
  console.warn(`🔄 [AI-PROVIDER] Switching ALL calls to Claude Opus 4.6. Reason: ${reason}`)
}

/** Reset back to Gemini (e.g., for new pipeline run) */
export function resetToGemini(): void {
  _useClaudeFallback = false
  _switchedAt = null
  console.log('🔄 [AI-PROVIDER] Reset to Gemini (primary)')
}

/** Check if an error is a 503 / overload */
function is503Error(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return (
    msg.includes('503') ||
    msg.toLowerCase().includes('overloaded') ||
    msg.toLowerCase().includes('high demand') ||
    msg.toLowerCase().includes('service unavailable') ||
    msg === 'SERVICE_OVERLOADED'
  )
}

// ─── Gemini → Claude mapping helpers ───────────────────────────────

/**
 * Map Gemini thinking level to Claude config.
 * Claude Opus 4.6 uses adaptive thinking — no budget_tokens needed.
 */
function mapThinkingToEffort(thinkingLevel?: string): 'low' | 'medium' | 'high' {
  switch (thinkingLevel?.toUpperCase()) {
    case 'HIGH': return 'high'
    case 'MEDIUM': return 'medium'
    case 'LOW': return 'low'
    default: return 'high'
  }
}

// ─── Main unified call function ────────────────────────────────────

export interface AICallOptions {
  /** Gemini model name (e.g. 'gemini-3.1-pro-preview') */
  model: string
  /** The prompt / contents */
  prompt: string
  /** System instruction for Claude (optional, extracted from prompt if needed) */
  systemPrompt?: string
  /** Gemini config (thinking level, max tokens, timeout, etc.) */
  geminiConfig?: GenerateContentConfig
  /** Gemini thinking level as string for Claude effort mapping */
  thinkingLevel?: string
  /** Max output tokens */
  maxOutputTokens?: number
  /** Request timeout in ms */
  timeout?: number
  /** Caller ID for logging */
  callerId?: string
  /** If true, uses Gemini's Google Search grounding tool */
  useGoogleSearch?: boolean
  /** JSON schema for structured output (Gemini responseSchema) */
  responseSchema?: Record<string, unknown>
}

export interface AICallResult {
  text: string
  provider: 'gemini' | 'claude'
  model: string
  switched?: boolean // true if this call triggered the switch
}

/**
 * Unified AI call that routes to Gemini or Claude based on global state.
 * If Gemini 503s, switches globally and retries on Claude.
 */
export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const {
    model,
    prompt,
    systemPrompt,
    geminiConfig,
    thinkingLevel,
    maxOutputTokens = 16000,
    timeout = 120_000,
    callerId = 'unknown',
    useGoogleSearch = false,
    responseSchema,
  } = options

  // If already switched to Claude, go directly
  if (_useClaudeFallback) {
    console.log(`[${callerId}] 🔵 Using Claude (global fallback active)`)
    return callClaude(options)
  }

  // Try Gemini first
  try {
    console.log(`[${callerId}] 🟢 Calling Gemini ${model}`)
    const response = await geminiClient.models.generateContent({
      model,
      contents: prompt,
      config: {
        ...geminiConfig,
        maxOutputTokens: geminiConfig?.maxOutputTokens || maxOutputTokens,
        httpOptions: { timeout: geminiConfig?.httpOptions?.timeout || timeout },
        ...(responseSchema ? { responseSchema, responseMimeType: 'application/json' } : {}),
        ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    })
    return {
      text: response.text || '',
      provider: 'gemini',
      model,
    }
  } catch (err) {
    if (is503Error(err)) {
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error(`[${callerId}] ⚠️ Gemini 503 but ANTHROPIC_API_KEY not set — cannot fallback to Claude`)
        throw err
      }
      console.warn(`[${callerId}] ⚠️ Gemini 503 detected! Switching to Claude...`)
      switchToClaude(`503 from ${model} in ${callerId}`)
      const result = await callClaude(options)
      return { ...result, switched: true }
    }
    // Non-503 errors: rethrow
    throw err
  }
}

/**
 * Call Claude Opus 4.6 with the same prompt content.
 */
async function callClaude(options: AICallOptions): Promise<AICallResult> {
  const {
    prompt,
    systemPrompt,
    thinkingLevel,
    maxOutputTokens = 16000,
    callerId = 'unknown',
    responseSchema,
  } = options

  const client = getAnthropicClient()
  const claudeModel = 'claude-opus-4-6'
  const effort = mapThinkingToEffort(thinkingLevel)

  console.log(`[${callerId}] 🔵 Calling Claude ${claudeModel} (effort: ${effort})`)

  // Build system prompt — include JSON schema instruction if needed
  let system = systemPrompt || ''
  if (responseSchema) {
    system += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

  try {
    // Use streaming for large outputs to avoid timeouts
    const stream = client.messages.stream({
      model: claudeModel,
      max_tokens: Math.min(maxOutputTokens, 128000),
      thinking: { type: 'adaptive' },
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    })

    const finalMessage = await stream.finalMessage()

    // Extract text from response blocks
    let text = ''
    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        text += block.text
      }
    }

    console.log(`[${callerId}] 🔵 Claude response: ${text.length} chars`)
    return {
      text,
      provider: 'claude',
      model: claudeModel,
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ Claude call failed: ${errMsg}`)
    throw err
  }
}
