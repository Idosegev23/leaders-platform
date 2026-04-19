import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isDevMode, DEV_AUTH_USER } from '@/lib/auth/dev-mode'
import { CONFIG_DEFAULTS } from '@/lib/config/defaults'
import { invalidateConfig } from '@/lib/config/admin-config'
import type { ConfigCategory } from '@/lib/config/admin-config'

export const maxDuration = 30

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function verifyAdmin(request: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (isDevMode) return { userId: DEV_AUTH_USER.id }

  const supabase = getAdminClient()
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // For server-side calls, we use the cookie-based auth through the supabase middleware
  // But for client-side fetch calls, we need to verify the token
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { userId: user.id }
}

/**
 * GET /api/admin/config?category=ai_prompts
 *
 * Returns merged list: defaults + DB overrides.
 * Each item has { key, description, value_type, value, defaultValue, isOverridden, dbId, updatedAt }
 */
export async function GET(request: NextRequest) {
  const requestId = `admin-config-${Date.now()}`
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as ConfigCategory | null

  if (!category || !CONFIG_DEFAULTS[category]) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }

  console.log(`[${requestId}] GET admin config: ${category}`)

  const supabase = getAdminClient()
  const { data: dbConfigs } = await supabase
    .from('admin_config')
    .select('id, key, value, description, value_type, updated_at')
    .eq('category', category)

  const dbMap = new Map((dbConfigs || []).map(c => [c.key, c]))

  // Merge defaults with DB overrides
  const defaults = CONFIG_DEFAULTS[category] || {}
  const merged = Object.entries(defaults).map(([key, def]) => {
    const db = dbMap.get(key)
    return {
      key,
      description: db?.description || def.description,
      value_type: db?.value_type || def.value_type,
      value: db ? db.value : def.value,
      defaultValue: def.value,
      isOverridden: !!db,
      dbId: db?.id || null,
      updatedAt: db?.updated_at || null,
      group: def.group || null,
    }
  })

  return NextResponse.json({ configs: merged, category })
}

/**
 * POST /api/admin/config
 * Body: { category, key, value, description?, value_type? }
 *
 * Upserts a config value. Creates history record.
 */
export async function POST(request: NextRequest) {
  const requestId = `admin-config-${Date.now()}`
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  const body = await request.json()
  const { category, key, value, reason } = body as {
    category: ConfigCategory
    key: string
    value: unknown
    reason?: string
  }

  if (!category || !key || value === undefined) {
    return NextResponse.json({ error: 'Missing category, key, or value' }, { status: 400 })
  }

  // Get default for validation
  const def = CONFIG_DEFAULTS[category]?.[key]
  if (!def) {
    return NextResponse.json({ error: `Unknown config key: ${category}/${key}` }, { status: 400 })
  }

  // Validate
  const validationError = validateConfigValue(value, def.value_type)
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  console.log(`[${requestId}] POST admin config: ${category}/${key}`)

  const supabase = getAdminClient()

  // Check if exists
  const { data: existing } = await supabase
    .from('admin_config')
    .select('id, value')
    .eq('category', category)
    .eq('key', key)
    .single()

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('admin_config')
      .update({
        value,
        updated_by: auth.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

    if (error) {
      console.error(`[${requestId}] Update error:`, error)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    // Log history
    await supabase.from('admin_config_history').insert({
      config_id: existing.id,
      category,
      key,
      old_value: existing.value,
      new_value: value,
      changed_by: auth.userId,
      change_reason: reason || null,
    })
  } else {
    // Insert new
    const { data: inserted, error } = await supabase
      .from('admin_config')
      .insert({
        category,
        key,
        value,
        description: def.description,
        value_type: def.value_type,
        updated_by: auth.userId,
      })
      .select('id')
      .single()

    if (error) {
      console.error(`[${requestId}] Insert error:`, error)
      return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
    }

    // Log history (null old value for first save)
    await supabase.from('admin_config_history').insert({
      config_id: inserted.id,
      category,
      key,
      old_value: def.value as Record<string, unknown>,
      new_value: value as Record<string, unknown>,
      changed_by: auth.userId,
      change_reason: reason || 'שמירה ראשונה',
    })
  }

  // Invalidate cache
  invalidateConfig(category, key)

  console.log(`[${requestId}] Saved ${category}/${key}`)
  return NextResponse.json({ success: true })
}

/**
 * DELETE /api/admin/config?category=X&key=Y
 * Removes the DB override, reverting to code default.
 */
export async function DELETE(request: NextRequest) {
  const requestId = `admin-config-${Date.now()}`
  const auth = await verifyAdmin(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') as ConfigCategory | null
  const key = searchParams.get('key')

  if (!category || !key) {
    return NextResponse.json({ error: 'Missing category or key' }, { status: 400 })
  }

  console.log(`[${requestId}] DELETE admin config: ${category}/${key}`)

  const supabase = getAdminClient()
  const { error } = await supabase
    .from('admin_config')
    .delete()
    .eq('category', category)
    .eq('key', key)

  if (error) {
    console.error(`[${requestId}] Delete error:`, error)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }

  invalidateConfig(category, key)
  return NextResponse.json({ success: true })
}

// --- Validation ---

function validateConfigValue(value: unknown, valueType: string): string | null {
  if (valueType === 'text') {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return 'ערך טקסט לא יכול להיות ריק'
    }
  }
  if (valueType === 'number') {
    if (typeof value !== 'number' || isNaN(value)) {
      return 'נדרש ערך מספרי תקין'
    }
  }
  if (valueType === 'boolean') {
    if (typeof value !== 'boolean') {
      return 'נדרש ערך true/false'
    }
  }
  if (valueType === 'json') {
    if (typeof value === 'string') {
      try { JSON.parse(value) } catch { return 'JSON לא תקין' }
    }
  }
  return null
}
