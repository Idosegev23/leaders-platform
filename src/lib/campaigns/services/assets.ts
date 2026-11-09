/**
 * Private files: upload intent → direct upload to a signed URL → server-side
 * verification → usable. A version, publication or metric can only reference
 * an asset in status "ready", so a failed or partial upload can never count
 * as a submission. Storage keys are `{campaign}/{asset-id}.{ext}`: never the
 * user's file name, never overwritten.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { Ctx, PortalActor } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { forbidden, invalid, notFound } from '../errors'
import { isUuid, portalParticipationScope, portalSubjectId, requireCampaign, requirePortal, requirePortalParticipation } from '../auth/policy'
import { MIME_RULES, maxBytesFor, sniffMatches, type StorageProvider } from '../storage/provider'
import { rateLimit } from '../rate-limit'
import { parseInput } from '../validation'

export const DOWNLOAD_TTL_SECONDS = 300

export const uploadIntentSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  participation_id: z.string().uuid().optional(),
  purpose: z.enum(['content', 'evidence', 'metric_evidence', 'brief', 'other']),
  filename: z.string().trim().min(1).max(200),
  mime_type: z.string().trim().max(100),
  size: z.number().int().positive(),
})

export async function createUploadIntent(ctx: Ctx, input: unknown) {
  const v = parseInput(uploadIntentSchema, input)
  const rule = MIME_RULES[v.mime_type]
  if (!rule) throw invalid('סוג הקובץ אינו נתמך. אפשר להעלות JPG, PNG, WEBP, MP4, MOV או PDF.')
  const max = maxBytesFor(rule.kind)
  if (v.size > max) throw invalid(`הקובץ גדול מדי. המגבלה ל${rule.kind === 'video' ? 'וידאו' : rule.kind === 'pdf' ? 'PDF' : 'תמונה'} היא ${Math.round(max / 1024 / 1024)}MB.`)

  let campaignId: string
  let participationId: string | null = v.participation_id ?? null
  let byUser: string | null = null
  let byGrant: string | null = null
  if (ctx.actor.kind === 'internal') {
    if (participationId) {
      const p = await one<{ campaign_id: string }>(ctx.db, `select campaign_id from cm_participations where id = $1`, [participationId])
      if (!p) throw notFound('ההשתתפות')
      campaignId = p.campaign_id
    } else {
      if (!v.campaign_id) throw invalid('חסר קמפיין')
      campaignId = v.campaign_id
    }
    await requireCampaign(ctx.db, ctx, campaignId, 'operate')
    byUser = ctx.actor.userId
  } else {
    const actor = requirePortal(ctx.actor)
    if (actor.grantKind === 'client') throw forbidden('העלאת קבצים אינה זמינה בפורטל הלקוח')
    if (!participationId) throw invalid('חסרה השתתפות')
    const p = await requirePortalParticipation(ctx.db, actor, participationId)
    campaignId = p.campaign_id
    byGrant = actor.grantId
    await rateLimit(ctx.db, `upload:${actor.grantId}`, 60, 3600, ctx.now)
  }

  const id = randomUUID()
  const key = `${campaignId}/${id}.${rule.ext}`
  await ctx.db.query(
    `insert into cm_assets (id, campaign_id, participation_id, purpose, storage_provider, storage_key, original_filename, mime_type,
        declared_size, uploaded_by_user_id, uploaded_by_grant_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, campaignId, participationId, v.purpose, ctx.deps.storage.name, key, v.filename.slice(0, 200), v.mime_type, v.size, byUser, byGrant],
  )
  const target = await ctx.deps.storage.createUploadTarget(key, v.mime_type)
  return { asset_id: id, upload: target, max_bytes: max }
}

async function loadOwnAsset(db: Queryable, ctx: Ctx, assetId: string) {
  if (!isUuid(assetId)) throw notFound('הקובץ')
  const a = await one<{
    id: string; campaign_id: string; participation_id: string | null; status: string; storage_key: string; mime_type: string
    declared_size: string; uploaded_by_user_id: string | null; uploaded_by_grant_id: string | null; purpose: string
  }>(db, `select id, campaign_id, participation_id, status, storage_key, mime_type, declared_size::text, uploaded_by_user_id,
            uploaded_by_grant_id, purpose from cm_assets where id = $1`, [assetId])
  if (!a) throw notFound('הקובץ')
  const mine = ctx.actor.kind === 'internal' ? a.uploaded_by_user_id === ctx.actor.userId
    : ctx.actor.kind === 'portal' ? a.uploaded_by_grant_id === ctx.actor.grantId : false
  if (!mine) throw notFound('הקובץ')
  return a
}

/**
 * Verify the uploaded object: it exists, its size matches what was declared
 * and allowed, and its first bytes match the declared type. Safe to call
 * again after a failed or interrupted upload.
 */
export async function completeUpload(ctx: Ctx, assetId: string) {
  const a = await loadOwnAsset(ctx.db, ctx, assetId)
  if (a.status === 'ready') return { asset_id: a.id, status: 'ready' as const }
  if (a.status !== 'pending') throw invalid('הקובץ נכשל בבדיקה. יש להעלות אותו מחדש.')
  const storage = ctx.deps.storage
  const info = await storage.stat(a.storage_key)
  if (!info) {
    return { asset_id: a.id, status: 'pending' as const, message: 'הקובץ עדיין לא הגיע לאחסון. אם ההעלאה נקטעה, אפשר לנסות שוב.' }
  }
  const rule = MIME_RULES[a.mime_type]
  const fail = async (reason: string) => {
    await ctx.db.query(`update cm_assets set status = 'failed', failure_reason = $2 where id = $1`, [a.id, reason])
    await storage.remove(a.storage_key).catch(() => {})
    throw invalid(reason)
  }
  if (info.size !== Number(a.declared_size)) await fail('גודל הקובץ שהתקבל אינו תואם לקובץ שנבחר. ייתכן שההעלאה נקטעה; נסו שוב.')
  if (info.size > maxBytesFor(rule.kind)) await fail('הקובץ גדול מהמותר')
  const head = await storage.readHead(a.storage_key, 16)
  if (!sniffMatches(a.mime_type, head)) await fail('תוכן הקובץ אינו תואם לסוג הקובץ שהוצהר')
  await ctx.db.query(`update cm_assets set status = 'ready', verified_size = $2, verified_at = $3 where id = $1 and status = 'pending'`,
    [a.id, info.size, ctx.now])
  return { asset_id: a.id, status: 'ready' as const }
}

/** Throws unless the asset is ready, belongs to the campaign/participation, and was uploaded by this actor or the internal team. */
export async function requireReadyAsset(db: Queryable, ctx: Ctx, assetId: string, scope: { campaignId: string; participationId?: string | null; purposes: string[] }) {
  const a = await one<{ id: string; campaign_id: string; participation_id: string | null; status: string; purpose: string; uploaded_by_grant_id: string | null }>(db,
    `select id, campaign_id, participation_id, status, purpose, uploaded_by_grant_id from cm_assets where id = $1`, [assetId])
  if (!a || a.campaign_id !== scope.campaignId) throw invalid('הקובץ המצורף לא נמצא')
  if (scope.participationId && a.participation_id && a.participation_id !== scope.participationId) throw invalid('הקובץ שייך להשתתפות אחרת')
  if (ctx.actor.kind === 'portal' && a.uploaded_by_grant_id !== ctx.actor.grantId) throw invalid('הקובץ המצורף לא נמצא')
  if (a.status !== 'ready') throw invalid('הקובץ עדיין לא אומת. השלימו את ההעלאה לפני ההגשה.')
  if (!scope.purposes.includes(a.purpose)) throw invalid('סוג הקובץ המצורף אינו מתאים לפעולה')
  return a
}

/**
 * Signed, short-lived download URL, only after an access check:
 *  internal: campaign member; creator/agent: their participation;
 *  client: content versions that passed internal approval, in their campaign.
 */
export async function getAssetUrl(ctx: Ctx, assetId: string) {
  if (!isUuid(assetId)) throw notFound('הקובץ')
  const a = await one<{ id: string; campaign_id: string; participation_id: string | null; status: string; storage_key: string; original_filename: string | null; mime_type: string }>(ctx.db,
    `select id, campaign_id, participation_id, status, storage_key, original_filename, mime_type from cm_assets where id = $1`, [assetId])
  if (!a || a.status !== 'ready') throw notFound('הקובץ')
  if (ctx.actor.kind === 'internal') {
    await requireCampaign(ctx.db, ctx, a.campaign_id, 'operate')
  } else {
    const actor: PortalActor = requirePortal(ctx.actor)
    if (actor.grantKind === 'client') {
      const ok = await one(ctx.db,
        `select 1 from cm_content_versions v join cm_deliverables d on d.id = v.deliverable_id join cm_campaigns c on c.id = d.campaign_id
          where v.asset_id = $1 and d.campaign_id = $2 and c.client_id = $3
            and exists (select 1 from cm_approval_decisions ad where ad.target_type = 'content_version' and ad.target_id = v.id
                         and ad.approval_stage = 'internal' and ad.decision = 'approved')`,
        [a.id, actor.campaignId, actor.clientId])
      if (!ok) throw notFound('הקובץ')
    } else {
      const ok = await one(ctx.db,
        `select 1 from cm_participations p where p.id = $1 and ${portalParticipationScope(actor, '$2', '$3')}`,
        [a.participation_id, actor.campaignId, portalSubjectId(actor)])
      if (!a.participation_id || !ok) throw notFound('הקובץ')
    }
  }
  const url = await ctx.deps.storage.createDownloadUrl(a.storage_key, DOWNLOAD_TTL_SECONDS, a.original_filename ?? undefined)
  return { url, mime_type: a.mime_type, expires_in: DOWNLOAD_TTL_SECONDS }
}

/**
 * Controlled orphan cleanup (cron): pending/failed uploads older than 24h, and
 * ready files never attached to anything after 7 days. The object is removed
 * first; the row is kept with status "deleted" for the audit trail.
 */
export async function cleanupOrphanAssets(pool: Pool, storage: StorageProvider, now: Date, limit = 100) {
  const rows = await many<{ id: string; storage_key: string; campaign_id: string; status: string }>(pool,
    `select a.id, a.storage_key, a.campaign_id, a.status from cm_assets a
      where a.storage_provider = $3 and (
            (a.status in ('pending','failed') and a.created_at < $1::timestamptz - interval '24 hours')
         or (a.status = 'ready' and a.created_at < $1::timestamptz - interval '7 days'
             and not exists (select 1 from cm_content_versions v where v.asset_id = a.id)
             and not exists (select 1 from cm_publications p where p.evidence_asset_id = a.id)
             and not exists (select 1 from cm_metric_observations m where m.evidence_asset_id = a.id)))
      limit $2`, [now, limit, storage.name])
  let removed = 0
  for (const r of rows) {
    try {
      await storage.remove(r.storage_key)
      await withTx(async (tx) => {
        await tx.query(`update cm_assets set status = 'deleted', deleted_at = $2 where id = $1`, [r.id, now])
        await audit(tx, { actor: { kind: 'system' } }, { campaignId: r.campaign_id, entityType: 'asset', entityId: r.id, action: 'asset.orphan_removed',
          summary: r.status === 'ready' ? 'קובץ שלא שויך לשום רשומה נמחק' : 'העלאה שלא הושלמה נוקתה' })
      }, pool)
      removed++
    } catch (e) {
      console.error('[campaigns/assets] cleanup failed for', r.id, e instanceof Error ? e.message : e)
    }
  }
  return { candidates: rows.length, removed }
}
