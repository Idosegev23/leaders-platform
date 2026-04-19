/**
 * API Route Auth Helper
 * Returns authenticated user or null.
 * Respects dev mode (only in non-production).
 */

import { createClient } from '@/lib/supabase/server'
import { isDevMode, DEV_USER } from '@/lib/auth/dev-mode'

export async function getAuthenticatedUser() {
  if (isDevMode && process.env.NODE_ENV !== 'production') {
    return { id: DEV_USER.id, email: DEV_USER.email }
  }

  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return { id: user.id, email: user.email }
}
