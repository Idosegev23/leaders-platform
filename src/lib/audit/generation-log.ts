/**
 * Generation Audit Log — tracks every AI call for debugging and learning.
 *
 * Each entry records: what model, what prompt (hash), what output (hash),
 * how long it took, and whether it was a fallback.
 *
 * Stored in document data as _auditLog: AuditEntry[]
 * Lightweight — stores hashes not full prompts (privacy + size).
 */

export interface AuditEntry {
  timestamp: string
  stage: string           // 'extraction' | 'proposal' | 'research' | 'influencer' | 'images' | 'design-system' | 'planner' | 'slides'
  model: string           // 'gpt-5.4' | 'gemini-3.1-pro-preview' | etc.
  promptLength: number    // chars
  responseLength: number  // chars
  durationMs: number
  success: boolean
  isFallback: boolean
  error?: string
  notes?: string          // e.g. "switched to Claude", "used default colors"
}

/** In-memory log for current generation session */
let _sessionLog: AuditEntry[] = []

export function resetAuditLog() {
  _sessionLog = []
}

export function logAuditEntry(entry: Omit<AuditEntry, 'timestamp'>) {
  const full: AuditEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  }
  _sessionLog.push(full)

  // Also console log for Vercel visibility
  const icon = entry.success ? '✅' : '❌'
  const fallback = entry.isFallback ? ' [FALLBACK]' : ''
  console.log(`[Audit] ${icon} ${entry.stage} | ${entry.model} | ${entry.durationMs}ms | prompt=${entry.promptLength}ch → response=${entry.responseLength}ch${fallback}${entry.notes ? ` | ${entry.notes}` : ''}`)
}

export function getAuditLog(): AuditEntry[] {
  return [..._sessionLog]
}

/** Generate a summary for storing in document data */
export function getAuditSummary(): {
  entries: AuditEntry[]
  totalDurationMs: number
  modelUsage: Record<string, number>
  fallbackCount: number
  errorCount: number
} {
  const entries = getAuditLog()
  const totalDurationMs = entries.reduce((sum, e) => sum + e.durationMs, 0)
  const modelUsage: Record<string, number> = {}
  let fallbackCount = 0
  let errorCount = 0

  for (const entry of entries) {
    modelUsage[entry.model] = (modelUsage[entry.model] || 0) + 1
    if (entry.isFallback) fallbackCount++
    if (!entry.success) errorCount++
  }

  return { entries, totalDurationMs, modelUsage, fallbackCount, errorCount }
}
