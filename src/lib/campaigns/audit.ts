import type { Queryable } from './db'
import { actorIds, actorLabel, type Ctx } from './context'

const SENSITIVE = /token|secret|password|hash|address|phone|email|cookie|authorization/i

/** Strip secrets and contact details before anything reaches the audit log. */
export function sanitizeChanges(changes: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!changes) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(changes)) {
    if (SENSITIVE.test(k)) {
      out[k] = '[redacted]'
    } else if (typeof v === 'string' && v.length > 500) {
      out[k] = v.slice(0, 500) + '…'
    } else {
      out[k] = v
    }
  }
  return out
}

export interface AuditInput {
  campaignId: string | null
  entityType: string
  entityId: string | null
  action: string
  summary?: string
  changes?: Record<string, unknown>
  correlationId?: string
}

export async function audit(db: Queryable, ctx: Pick<Ctx, 'actor'>, e: AuditInput): Promise<void> {
  const ids = actorIds(ctx.actor)
  await db.query(
    `insert into cm_audit_events (campaign_id, entity_type, entity_id, action, actor_type, actor_user_id, actor_grant_id,
       actor_label, summary, changes, correlation_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      e.campaignId, e.entityType, e.entityId, e.action,
      ctx.actor.kind === 'internal' ? 'user' : ctx.actor.kind === 'portal' ? 'portal' : 'system',
      ids.userId, ids.grantId, actorLabel(ctx.actor), e.summary ?? null,
      sanitizeChanges(e.changes), e.correlationId ?? null,
    ],
  )
}
