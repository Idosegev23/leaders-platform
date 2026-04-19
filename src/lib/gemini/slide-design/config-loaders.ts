/**
 * Config loaders — all connected to admin panel via getConfig().
 * Each loader falls back to defaults from defaults.ts.
 */

import { getConfig } from '@/lib/config/admin-config'
import { resolveModels } from '@/lib/ai-provider'
import {
  PROMPT_DEFAULTS,
  DESIGN_DEFAULTS,
  MODEL_DEFAULTS,
  PIPELINE_DEFAULTS,
} from '@/lib/config/defaults'
import type { PacingDirective } from './types'

// ─── Model Loaders ────────────────────────────────────

/** Models for Design System (foundation) — respects global override */
export async function getDesignSystemModels(): Promise<string[]> {
  return resolveModels(
    'slide_designer.primary_model',
    'slide_designer.fallback_model',
    MODEL_DEFAULTS['slide_designer.primary_model'].value as string,
    MODEL_DEFAULTS['slide_designer.fallback_model'].value as string,
  )
}

/** Models for Batch slide generation — respects global override */
export async function getBatchModels(): Promise<string[]> {
  return resolveModels(
    'slide_designer.batch_primary_model',
    'slide_designer.batch_fallback_model',
    MODEL_DEFAULTS['slide_designer.batch_primary_model'].value as string,
    MODEL_DEFAULTS['slide_designer.batch_fallback_model'].value as string,
  )
}

// ─── Prompt Loaders ───────────────────────────────────

export async function getSystemInstruction(): Promise<string> {
  return getConfig('ai_prompts', 'slide_designer.system_instruction', PROMPT_DEFAULTS['slide_designer.system_instruction'].value as string)
}

// v2: getDesignPrinciples, getElementFormat, getTechnicalRules, getFinalInstruction
// are deprecated — their content is now in the system instruction.

export async function getImageRoleHints(): Promise<Record<string, string>> {
  return getConfig('ai_prompts', 'slide_designer.image_role_hints', PROMPT_DEFAULTS['slide_designer.image_role_hints'].value as Record<string, string>)
}

// ─── Design System Loaders ────────────────────────────

export async function getLayoutArchetypes(): Promise<string[]> {
  return getConfig('design_system', 'layout_archetypes', DESIGN_DEFAULTS['layout_archetypes'].value as string[])
}

export async function getPacingMap(): Promise<Record<string, PacingDirective>> {
  return getConfig('design_system', 'pacing_map', DESIGN_DEFAULTS['pacing_map'].value as Record<string, PacingDirective>)
}

// v2: getDepthLayers deprecated — depth layers are in the system instruction.

// ─── Model Config Loaders ─────────────────────────────

export async function getThinkingLevel(): Promise<string> {
  return getConfig('ai_models', 'slide_designer.thinking_level', MODEL_DEFAULTS['slide_designer.thinking_level'].value as string)
}

export async function getBatchThinkingLevel(): Promise<string> {
  return getConfig('ai_models', 'slide_designer.batch_thinking_level', MODEL_DEFAULTS['slide_designer.batch_thinking_level'].value as string)
}

export async function getMaxOutputTokens(): Promise<number> {
  return getConfig('ai_models', 'slide_designer.max_output_tokens', MODEL_DEFAULTS['slide_designer.max_output_tokens'].value as number)
}

export async function getTemperature(): Promise<number> {
  return getConfig('ai_models', 'slide_designer.temperature', MODEL_DEFAULTS['slide_designer.temperature'].value as number)
}

// ─── Pipeline Config Loaders ──────────────────────────

export async function getBatchSize(): Promise<number> {
  return getConfig('pipeline', 'slide_designer.batch_size', PIPELINE_DEFAULTS['slide_designer.batch_size'].value as number)
}
