/**
 * Admin Configuration Loader
 *
 * Provides getConfig<T>(category, key, defaultValue) that:
 * 1. Checks in-memory cache (60s TTL)
 * 2. Queries admin_config table via service role
 * 3. Falls back to defaultValue from code
 *
 * Empty DB = system works perfectly with code defaults.
 */

import { createClient } from '@supabase/supabase-js'

export type ConfigCategory =
  | 'ai_prompts'
  | 'ai_models'
  | 'design_system'
  | 'wizard'
  | 'pipeline'
  | 'feature_flags'

// Direct Supabase client with service role key — no cookies needed.
// This works outside of request context (from lib files, API routes, etc.)
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// In-memory cache with TTL
const cache = new Map<string, { value: unknown; expiry: number }>()
const CACHE_TTL = 60_000 // 60 seconds

/**
 * Get a config value with fallback to default.
 * Safe to call from anywhere — returns defaultValue if DB is unavailable.
 */
export async function getConfig<T>(
  category: ConfigCategory,
  key: string,
  defaultValue: T
): Promise<T> {
  const cacheKey = `${category}:${key}`

  // Check cache first
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiry) {
    return cached.value as T
  }

  try {
    const supabase = getServiceClient()
    if (!supabase) {
      cache.set(cacheKey, { value: defaultValue, expiry: Date.now() + CACHE_TTL })
      return defaultValue
    }

    const { data, error } = await supabase
      .from('admin_config')
      .select('value')
      .eq('category', category)
      .eq('key', key)
      .single()

    if (!error && data?.value !== undefined && data.value !== null) {
      // JSONB value — unwrap if it's a wrapped primitive
      const value = data.value as T
      cache.set(cacheKey, { value, expiry: Date.now() + CACHE_TTL })
      return value
    }
  } catch {
    // DB unreachable — fall through to default silently
  }

  // Cache the default to avoid repeated DB misses
  cache.set(cacheKey, { value: defaultValue, expiry: Date.now() + CACHE_TTL })
  return defaultValue
}

/**
 * Batch load all configs for a category.
 * Used by admin pages to display config list.
 */
export async function getCategoryConfigs(category: ConfigCategory) {
  const supabase = getServiceClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('admin_config')
    .select('id, category, key, value, description, value_type, updated_at, updated_by')
    .eq('category', category)
    .order('key')

  return data || []
}

/**
 * Get change history for a category (or all categories).
 */
export async function getConfigHistory(category?: ConfigCategory, limit = 50) {
  const supabase = getServiceClient()
  if (!supabase) return []

  let query = supabase
    .from('admin_config_history')
    .select('id, config_id, category, key, old_value, new_value, changed_by, changed_at, change_reason')
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (category) {
    query = query.eq('category', category)
  }

  const { data } = await query
  return data || []
}

/**
 * Invalidate cache for a specific key or entire category.
 */
export function invalidateConfig(category: ConfigCategory, key?: string) {
  if (key) {
    cache.delete(`${category}:${key}`)
  } else {
    const keysToDelete: string[] = []
    cache.forEach((_, k) => {
      if (k.startsWith(`${category}:`)) keysToDelete.push(k)
    })
    keysToDelete.forEach(k => cache.delete(k))
  }
}
