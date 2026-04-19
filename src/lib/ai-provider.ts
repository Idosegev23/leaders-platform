/**
 * Global AI Provider Router
 *
 * Routes calls to Gemini, Claude, or OpenAI based on:
 * 1. Admin-configured global primary/fallback model
 * 2. Automatic retryable-error fallback (503/504/429)
 * 3. Per-agent model configs (when global override is off)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenAI, type GenerateContentConfig } from '@google/genai'
import { getConfig } from '@/lib/config/admin-config'

// ─── Types ────────────────────────────────────────────────────────

export type AIProvider = 'gemini' | 'claude' | 'openai'

export interface ModelDefinition {
  id: string
  provider: AIProvider
  label: string
  capabilities: {
    googleSearch: boolean
    responseSchema: boolean
    maxOutputTokens: number
  }
}

// ─── Model Registry ───────────────────────────────────────────────

export const MODEL_REGISTRY: ModelDefinition[] = [
  // Gemini
  {
    id: 'gemini-3.1-pro-preview',
    provider: 'gemini',
    label: 'Gemini 3.1 Pro (Preview)',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    label: 'Gemini 3 Flash (Preview)',
    capabilities: { googleSearch: true, responseSchema: true, maxOutputTokens: 65536 },
  },
  // OpenAI
  {
    id: 'gpt-5.2-pro-2025-12-11',
    provider: 'openai',
    label: 'GPT-5.2 Pro',
    capabilities: { googleSearch: false, responseSchema: true, maxOutputTokens: 100000 },
  },
  {
    id: 'gpt-5.2-2025-12-11',
    provider: 'openai',
    label: 'GPT-5.2',
    capabilities: { googleSearch: false, responseSchema: true, maxOutputTokens: 100000 },
  },
  // Claude
  {
    id: 'claude-opus-4-6',
    provider: 'claude',
    label: 'Claude Opus 4.6',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'claude',
    label: 'Claude Sonnet 4.6',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
  {
    id: 'claude-haiku-4-5-20251001',
    provider: 'claude',
    label: 'Claude Haiku 4.5',
    capabilities: { googleSearch: false, responseSchema: false, maxOutputTokens: 128000 },
  },
]

export function getModelDefinition(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find(m => m.id === modelId)
}

export function getProviderForModel(modelId: string): AIProvider {
  const def = getModelDefinition(modelId)
  if (def) return def.provider
  if (modelId.startsWith('claude')) return 'claude'
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai'
  return 'gemini'
}

// ─── Singleton clients ────────────────────────────────────────────

let _geminiClient: GoogleGenAI | null = null
function getGeminiClient(): GoogleGenAI {
  if (!_geminiClient) {
    _geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: { timeout: 600_000 },
    })
  }
  return _geminiClient
}

let _anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }
  return _anthropicClient
}

let _openaiClient: OpenAI | null = null
function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      timeout: 600_000, // 10 min — slide batches need long generation time
    })
  }
  return _openaiClient
}

// ─── Public API ───────────────────────────────────────────────────

export function getProviderStatus(): { provider: string; switchedAt: number | null } {
  return { provider: 'per-call', switchedAt: null }
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  return (
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('429') ||
    lower.includes('overloaded') ||
    lower.includes('high demand') ||
    lower.includes('service unavailable') ||
    lower.includes('deadline_exceeded') ||
    lower.includes('deadline expired') ||
    lower.includes('rate_limit') ||
    lower.includes('rate limit') ||
    msg === 'SERVICE_OVERLOADED'
  )
}

// ─── Thinking level mapping ───────────────────────────────────────

function mapThinkingToEffort(thinkingLevel?: string): 'low' | 'medium' | 'high' {
  switch (thinkingLevel?.toUpperCase()) {
    case 'HIGH': return 'high'
    case 'MEDIUM': return 'medium'
    case 'LOW': return 'low'
    default: return 'high'
  }
}

// ─── Model resolution ─────────────────────────────────────────────

export async function resolveModels(
  agentPrimaryKey: string,
  agentFallbackKey: string,
  agentPrimaryDefault: string = 'gemini-3.1-pro-preview',
  agentFallbackDefault: string = 'gemini-3-flash-preview',
): Promise<string[]> {
  try {
    const { getConfig } = await import('@/lib/config/admin-config')
    const primary = await getConfig('ai_models', agentPrimaryKey, agentPrimaryDefault) as string
    const fallback = await getConfig('ai_models', agentFallbackKey, agentFallbackDefault) as string
    return [primary, fallback]
  } catch {
    // If admin config unavailable, use defaults
    return [agentPrimaryDefault, agentFallbackDefault]
  }
}

// ─── Call options & result ─────────────────────────────────────────

/** A Gemini function declaration for tool calling */
export interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Inline image content for multimodal Gemini calls */
export interface InlineImage {
  mimeType: string
  data: string  // base64
}

export interface AICallOptions {
  /** Model ID (Gemini, Claude, or OpenAI) */
  model: string
  /** The prompt / contents */
  prompt: string
  /** System instruction */
  systemPrompt?: string
  /** Gemini-specific config (thinking level, max tokens, timeout, etc.) */
  geminiConfig?: GenerateContentConfig
  /** Thinking level as string for effort mapping */
  thinkingLevel?: string
  /** Max output tokens */
  maxOutputTokens?: number
  /** Caller ID for logging */
  callerId?: string
  /** If true, uses Google Search grounding (Gemini only) */
  useGoogleSearch?: boolean
  /** If true, enables URL Context tool — model fetches URLs in prompt (Gemini only) */
  useUrlContext?: boolean
  /** If true, enables Python code execution sandbox (Gemini only) */
  useCodeExecution?: boolean
  /** Cached content name from createGeminiCache() — saves cost on repeated system prompts */
  cachedContent?: string
  /** Inline images for vision (Gemini only) */
  inlineImages?: InlineImage[]
  /** Function declarations for tool calling (Gemini only). Use callGeminiAgent for the call loop. */
  functionDeclarations?: GeminiFunctionDeclaration[]
  /** JSON schema for structured output */
  responseSchema?: Record<string, unknown>
  /** Skip global fallback — caller manages retries. Error propagates directly. */
  noGlobalFallback?: boolean
}

export interface AICallResult {
  text: string
  provider: AIProvider
  model: string
  switched?: boolean
}

// ─── Main unified call function ───────────────────────────────────

export async function callAI(options: AICallOptions): Promise<AICallResult> {
  const { model, noGlobalFallback } = options
  const provider = getProviderForModel(model)

  // If caller manages its own retries, skip global fallback — let errors propagate
  if (noGlobalFallback) {
    return callByProvider(options, model, provider)
  }

  return callWithFallback(options, model, provider)
}

// ─── Call with automatic fallback ─────────────────────────────────

async function callWithFallback(
  options: AICallOptions,
  model: string,
  provider: AIProvider,
): Promise<AICallResult> {
  const { callerId = 'unknown' } = options

  try {
    return await callByProvider(options, model, provider)
  } catch (err) {
    if (!isRetryableError(err)) throw err

    const fallbackModel = await getConfig('ai_models', 'global.fallback_model', 'gemini-3-flash-preview')
    const fallbackProvider = getProviderForModel(fallbackModel)

    if (fallbackModel === model) throw err // same model, can't help

    // Check API key availability
    if (fallbackProvider === 'claude' && !process.env.ANTHROPIC_API_KEY) throw err
    if (fallbackProvider === 'openai' && !process.env.OPENAI_API_KEY) throw err
    if (fallbackProvider === 'gemini' && !process.env.GEMINI_API_KEY) throw err

    console.warn(`[${callerId}] ⚠️ ${provider}/${model} failed (retryable)! Trying fallback: ${fallbackModel}`)

    const result = await callByProvider(options, fallbackModel, fallbackProvider)
    return { ...result, switched: true }
  }
}

// ─── Provider router ──────────────────────────────────────────────

async function callByProvider(
  options: AICallOptions,
  model: string,
  provider: AIProvider,
): Promise<AICallResult> {
  switch (provider) {
    case 'openai':
      return callOpenAIModel(options, model)
    case 'claude':
      return callClaudeModel(options, model)
    case 'gemini':
    default:
      return callGeminiDirect({ ...options, model })
  }
}

// ─── Gemini ───────────────────────────────────────────────────────

async function callGeminiDirect(options: AICallOptions): Promise<AICallResult> {
  const {
    model,
    prompt,
    geminiConfig,
    maxOutputTokens = 16000,
    callerId = 'unknown',
    useGoogleSearch = false,
    useUrlContext = false,
    useCodeExecution = false,
    cachedContent,
    inlineImages,
    functionDeclarations,
    responseSchema,
  } = options

  console.log(`[${callerId}] 🟢 Calling Gemini ${model}`)

  const client = getGeminiClient()

  // Build tools array — Gemini 3 supports combining multiple tools
  const tools: Array<Record<string, unknown>> = []
  if (useGoogleSearch) tools.push({ googleSearch: {} })
  if (useUrlContext) tools.push({ urlContext: {} })
  if (useCodeExecution) tools.push({ codeExecution: {} })
  if (functionDeclarations && functionDeclarations.length > 0) {
    tools.push({ functionDeclarations })
  }

  // Build contents — text + optional inline images
  const contents: unknown = inlineImages && inlineImages.length > 0
    ? [
        ...inlineImages.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: prompt },
      ]
    : prompt

  // When combining built-in tools (google_search etc) with function declarations,
  // Gemini requires toolConfig.includeServerSideToolInvocations = true
  const hasBuiltIn = useGoogleSearch || useUrlContext || useCodeExecution
  const hasFunctions = functionDeclarations && functionDeclarations.length > 0
  const needsServerSideConfig = hasBuiltIn && hasFunctions

  const response = await client.models.generateContent({
    model,
    contents: contents as any,
    config: {
      ...geminiConfig,
      maxOutputTokens: geminiConfig?.maxOutputTokens || maxOutputTokens,
      ...(responseSchema ? { responseSchema, responseMimeType: 'application/json' } : {}),
      ...(tools.length > 0 ? { tools } : {}),
      ...(cachedContent ? { cachedContent } : {}),
      ...(needsServerSideConfig ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
    } as GenerateContentConfig,
  })

  return { text: response.text || '', provider: 'gemini', model }
}

// ─── Gemini Cache Helpers ────────────────────────────────────────────

/**
 * Create an explicit Gemini context cache.
 * Use for large system prompts that get reused across many calls.
 *
 * Min tokens to cache:
 * - gemini-3-flash-preview: 1,024
 * - gemini-3.1-pro-preview: 4,096
 *
 * @returns the cache resource name (pass to callAI as cachedContent)
 */
export async function createGeminiCache(opts: {
  model: string
  systemInstruction?: string
  contents?: string
  ttlSeconds?: number
  callerId?: string
}): Promise<string> {
  const { model, systemInstruction, contents, ttlSeconds = 3600, callerId = 'cache' } = opts
  const client = getGeminiClient()

  const sysLen = systemInstruction?.length || 0
  const contLen = contents?.length || 0
  console.log(`[${callerId}] 💾 Creating Gemini cache — model=${model}, sysInstr=${sysLen} chars, contents=${contLen} chars, TTL=${ttlSeconds}s`)
  const t0 = Date.now()
  const cache = await (client as any).caches.create({
    model,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(contents ? { contents } : {}),
      ttl: `${ttlSeconds}s`,
    },
  })

  console.log(`[${callerId}] 💾 ✅ Cache created in ${Date.now() - t0}ms: ${cache.name}`)
  return cache.name as string
}

/** Delete a Gemini cache (cleanup) */
export async function deleteGeminiCache(name: string): Promise<void> {
  try {
    const client = getGeminiClient()
    await (client as any).caches.delete({ name })
  } catch (err) {
    console.warn(`[cache] Failed to delete ${name}:`, err)
  }
}

// ─── Gemini Function-Calling Agent Loop ──────────────────────────────

/**
 * Run a Gemini agentic loop with automatic function calling.
 * The model decides which tools to call; we execute them and feed results back.
 *
 * @param options - normal AI call options + functionHandlers
 * @returns final text response after all tool calls resolve
 */
export async function callGeminiAgent(options: AICallOptions & {
  functionHandlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  maxIterations?: number
}): Promise<{ text: string; toolCalls: Array<{ name: string; args: unknown; result: unknown }> }> {
  const {
    model,
    prompt,
    systemPrompt,
    functionDeclarations = [],
    functionHandlers,
    maxIterations = 6,
    callerId = 'agent',
    useGoogleSearch = false,
    useUrlContext = false,
    useCodeExecution = false,
    maxOutputTokens = 16000,
    geminiConfig,
  } = options

  const client = getGeminiClient()
  const toolCalls: Array<{ name: string; args: unknown; result: unknown }> = []

  // Build tools array
  const tools: Array<Record<string, unknown>> = []
  if (useGoogleSearch) tools.push({ googleSearch: {} })
  if (useUrlContext) tools.push({ urlContext: {} })
  if (useCodeExecution) tools.push({ codeExecution: {} })
  if (functionDeclarations.length > 0) tools.push({ functionDeclarations })

  // Conversation history
  const history: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [
    { role: 'user', parts: [{ text: prompt }] },
  ]

  console.log(`[${callerId}] 🤖 Agent loop start — model=${model}, maxIters=${maxIterations}, tools=[${[useGoogleSearch && 'search', useUrlContext && 'url', useCodeExecution && 'code', functionDeclarations.length && `${functionDeclarations.length}fn`].filter(Boolean).join(',')}]`)

  for (let iter = 0; iter < maxIterations; iter++) {
    const iterStart = Date.now()
    console.log(`[${callerId}] 🔁 Agent iteration ${iter + 1}/${maxIterations} — history length=${history.length}`)

    // When combining built-in tools with function declarations, Gemini requires this flag
    const hasBuiltInTools = useGoogleSearch || useUrlContext || useCodeExecution
    const hasFnDecls = functionDeclarations.length > 0
    const response: any = await client.models.generateContent({
      model,
      contents: history as any,
      config: {
        ...geminiConfig,
        ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
        maxOutputTokens,
        ...(tools.length > 0 ? { tools } : {}),
        ...(hasBuiltInTools && hasFnDecls ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
      } as GenerateContentConfig,
    })

    // Look for function calls in response
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts || []
    const functionCalls = parts.filter((p: any) => p.functionCall)

    console.log(`[${callerId}]   ⏱️  iter ${iter + 1} took ${Date.now() - iterStart}ms, parts=${parts.length}, functionCalls=${functionCalls.length}`)

    if (functionCalls.length === 0) {
      // No more tool calls — return final text
      const text = response.text || parts.filter((p: any) => p.text).map((p: any) => p.text).join('')
      console.log(`[${callerId}] ✅ Agent finished after ${iter + 1} iterations, ${toolCalls.length} total tool calls, final text=${text.length} chars`)
      return { text, toolCalls }
    }

    // Append model's function-call response to history
    history.push({ role: 'model', parts })

    // Execute each function call and collect results
    const responseParts: Array<Record<string, unknown>> = []
    for (const part of functionCalls) {
      const fc = part.functionCall
      const handler = functionHandlers[fc.name]
      console.log(`[${callerId}]   🔧 Tool call: ${fc.name}(${JSON.stringify(fc.args).slice(0, 200)})`)

      let result: unknown
      try {
        if (!handler) throw new Error(`No handler for function: ${fc.name}`)
        result = await handler(fc.args || {})
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
      }

      toolCalls.push({ name: fc.name, args: fc.args, result })
      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: { result },
        },
      })
    }

    history.push({ role: 'user', parts: responseParts })
  }

  console.warn(`[${callerId}] ⚠️ Agent hit max iterations (${maxIterations})`)
  return { text: '', toolCalls }
}

// ─── OpenAI ───────────────────────────────────────────────────────

async function callOpenAIModel(options: AICallOptions, openaiModel: string): Promise<AICallResult> {
  const {
    prompt,
    systemPrompt,
    thinkingLevel,
    maxOutputTokens = 16000,
    callerId = 'unknown',
    responseSchema,
    useGoogleSearch,
  } = options

  if (useGoogleSearch) {
    console.warn(`[${callerId}] ⚠️ Google Search requested but OpenAI doesn't support it — skipping`)
  }

  const client = getOpenAIClient()
  const effort = mapThinkingToEffort(thinkingLevel)
  const modelDef = getModelDefinition(openaiModel)
  const maxTokens = Math.min(maxOutputTokens, modelDef?.capabilities.maxOutputTokens || 100000)

  // GPT-5.2 Pro minimum effort is 'medium'; supports medium/high/xhigh
  const isProModel = openaiModel.includes('-pro')
  const clampedEffort = (isProModel && effort === 'low') ? 'medium' : effort

  console.log(`[${callerId}] 🟠 Calling OpenAI ${openaiModel} via Responses API (reasoning_effort: ${clampedEffort})`)

  // Build instructions (system prompt + schema hint)
  let instructions = systemPrompt || ''
  if (responseSchema) {
    instructions += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

  try {
    const response = await (client.responses as any).create({
      model: openaiModel,
      instructions: instructions || undefined,
      input: prompt,
      max_output_tokens: maxTokens,
      reasoning: { effort: clampedEffort },
      store: false,
    })

    const text = response.output_text || ''
    console.log(`[${callerId}] 🟠 OpenAI response: ${text.length} chars`)

    return { text, provider: 'openai', model: openaiModel }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ OpenAI ${openaiModel} failed: ${errMsg}`)
    throw err
  }
}

// ─── Claude ───────────────────────────────────────────────────────

async function callClaudeModel(options: AICallOptions, claudeModel: string): Promise<AICallResult> {
  const {
    prompt,
    systemPrompt,
    thinkingLevel,
    maxOutputTokens = 16000,
    callerId = 'unknown',
    responseSchema,
    useGoogleSearch,
  } = options

  if (useGoogleSearch) {
    console.warn(`[${callerId}] ⚠️ Google Search requested but Claude doesn't support it — skipping`)
  }

  const client = getAnthropicClient()
  const effort = mapThinkingToEffort(thinkingLevel)
  const modelDef = getModelDefinition(claudeModel)
  const maxTokens = Math.min(maxOutputTokens, modelDef?.capabilities.maxOutputTokens || 128000)

  console.log(`[${callerId}] 🔵 Calling Claude ${claudeModel} (effort: ${effort})`)

  let system = systemPrompt || ''
  if (responseSchema) {
    system += `\n\nIMPORTANT: You MUST return your response as valid JSON matching this schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nReturn ONLY the JSON, no extra text or markdown.`
  }

  try {
    const stream = client.messages.stream({
      model: claudeModel,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort },
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    })

    const finalMessage = await stream.finalMessage()

    let text = ''
    for (const block of finalMessage.content) {
      if (block.type === 'text') {
        text += block.text
      }
    }

    console.log(`[${callerId}] 🔵 Claude response: ${text.length} chars`)
    return { text, provider: 'claude', model: claudeModel }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${callerId}] ❌ Claude ${claudeModel} failed: ${errMsg}`)
    throw err
  }
}
