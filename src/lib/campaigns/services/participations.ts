/**
 * Participation = a creator in a campaign. Two separate questions live here:
 *   selection_status     — did the agency and the client choose this creator?
 *   participation_status — did the creator (or agent) agree to take part?
 *
 * Terms (fee, deliverables summary, rights) carry a terms_version. A material
 * change after the creator accepted raises creator_reacceptance_required; a
 * change to client-visible terms after the client approved raises
 * client_reapproval_required. The old approval stays in history but is no
 * longer presented as covering the new terms.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Ctx, PortalActor } from '../context'
import { many, one, withTx, type Queryable } from '../db'
import { audit } from '../audit'
import { DomainError, invalid, notFound, precondition, versionConflict } from '../errors'
import { requireCampaign, requireInternal, requirePortal, requirePortalParticipation } from '../auth/policy'
import { PARTICIPATION_MACHINE, SELECTION_MACHINE, assertTransition, type ParticipationStatus, type SelectionStatus } from '../domain/state-machines'
import { parseMoney, toDecimal } from '../domain/money'
import { cancelJobs, closeTasks, ensureTask } from '../jobs/queue'
import { scheduleRightsJob, scheduleSubmissionJobs, sendTo, SUBMISSION_JOB_KINDS } from '../jobs/automation'
import { ownerRecipient } from './recipients'
import { createGrantTx } from './grants'
import { parseInput, zOptDate, zOptMoney, zOptText, zUuid, zVersion } from '../validation'

export interface ParticipationRow {
  id: string; campaign_id: string; creator_id: string; agent_id: string | null
  selection_status: SelectionStatus; participation_status: ParticipationStatus
  agreed_fee: string | null; currency: string; terms_version: number; accepted_terms_version: number | null
  rights_expires_at: string | null; deliverables_summary: string | null; client_visible_notes: string | null
  creator_reacceptance_required: boolean; client_reapproval_required: boolean; version: number
}

export async function lockParticipation(db: Queryable, id: string): Promise<ParticipationRow> {
  const p = await one<ParticipationRow>(db,
    `select id, campaign_id, creator_id, agent_id, selection_status, participation_status, agreed_fee::text, currency,
            terms_version, accepted_terms_version, to_char(rights_expires_at,'YYYY-MM-DD') as rights_expires_at,
            deliverables_summary, client_visible_notes, creator_reacceptance_required, client_reapproval_required, version
       from cm_participations where id = $1 for update`, [id])
  if (!p) throw notFound('ההשתתפות')
  return p
}

/** Keep the single fee budget line in step with the participation. */
export async function syncFeeLine(db: Queryable, ctx: Ctx, p: ParticipationRow): Promise<void> {
  const line = await one<{ id: string; status: string; amount: string }>(db,
    `select id, status, amount::text from cm_budget_lines where participation_id = $1 and source = 'participation_fee' for update`, [p.id])
  const working = ['accepted', 'active', 'completed'].includes(p.participation_status)
  const dead = p.participation_status === 'cancelled' || p.participation_status === 'declined' || ['rejected', 'withdrawn'].includes(p.selection_status)
  if (line?.status === 'actual') {
    if (p.agreed_fee !== null && parseMoney(p.agreed_fee) !== parseMoney(line.amount)) {
      throw precondition('שכר היוצר כבר נרשם כהוצאה בפועל. להפרש יש להוסיף שורת תקציב נפרדת.')
    }
    return
  }
  const user = ctx.actor.kind === 'internal' ? ctx.actor.userId : null
  if (p.agreed_fee === null || dead) {
    if (line && line.status !== 'cancelled') await db.query(`update cm_budget_lines set status = 'cancelled', version = version + 1 where id = $1`, [line.id])
    return
  }
  const status = working ? 'committed' : 'planned'
  if (!line) {
    const name = await one<{ display_name: string }>(db, `select display_name from cm_creators where id = $1`, [p.creator_id])
    await db.query(`insert into cm_budget_lines (campaign_id, participation_id, category, description, amount, currency, status, source, recorded_by)
      values ($1,$2,'influencers',$3,$4,$5,$6,'participation_fee',$7)`,
      [p.campaign_id, p.id, `שכר יוצר: ${name?.display_name ?? ''}`, p.agreed_fee, p.currency, status, user])
  } else if (line.status !== status || parseMoney(line.amount) !== parseMoney(p.agreed_fee)) {
    await db.query(`update cm_budget_lines set amount = $2, status = $3, version = version + 1 where id = $1`, [line.id, p.agreed_fee, status])
  }
}

// ── Adding creators ────────────────────────────────────────────────────────

export async function addCreatorsToCampaign(ctx: Ctx, campaignId: string, input: unknown) {
  const acc = await requireCampaign(ctx.db, ctx, campaignId, 'manage')
  const v = parseInput(z.object({ creator_ids: z.array(zUuid).min(1, 'יש לבחור לפחות יוצר אחד').max(100) }), input)
  if (['closed', 'cancelled'].includes(acc.status)) throw precondition('לא ניתן להוסיף משפיענים לקמפיין סגור או מבוטל')
  const actor = requireInternal(ctx.actor)
  return withTx(async (tx) => {
    const added: string[] = []
    const duplicates: string[] = []
    for (const cid of Array.from(new Set(v.creator_ids))) {
      const cr = await one<{ id: string; status: string; agent_id: string | null; display_name: string }>(tx,
        `select c.id, c.status, c.display_name,
                (select ac.agent_id from cm_agent_creators ac where ac.creator_id = c.id and ac.agent_id = c.agent_id and ac.active) as agent_id
           from cm_creators c where c.id = $1`, [cid])
      if (!cr) throw invalid('אחד היוצרים שנבחרו לא נמצא')
      if (cr.status === 'blocked') throw precondition(`היוצר "${cr.display_name}" חסום לשיוך`)
      const row = await one<{ id: string }>(tx,
        `insert into cm_participations (campaign_id, creator_id, agent_id, currency, created_by)
         values ($1,$2,$3,$4,$5) on conflict on constraint cm_participations_unique do nothing returning id`,
        [campaignId, cid, cr.agent_id, acc.currency, actor.userId])
      if (row) {
        added.push(row.id)
        await audit(tx, ctx, { campaignId, entityType: 'participation', entityId: row.id, action: 'participation.added', summary: `"${cr.display_name}" נוסף/ה כמועמד/ת` })
      } else {
        duplicates.push(cid)
      }
    }
    return { added, duplicates }
  }, ctx.db)
}

// ── Terms ──────────────────────────────────────────────────────────────────

export const updateTermsSchema = z.object({
  expected_version: zVersion,
  agreed_fee: zOptMoney,
  agent_id: z.string().uuid().nullable().optional(),
  deliverables_summary: zOptText(2000),
  contract_reference: zOptText(500),
  contract_signature_request_id: z.string().uuid().nullable().optional(),
  rights_expires_at: zOptDate,
  rights_notes: zOptText(2000),
  internal_notes: zOptText(5000),
  client_visible_notes: zOptText(2000),
  payment_status: z.enum(['not_recorded', 'pending', 'paid_manual']).optional(),
})

const MATERIAL_FOR_CREATOR = ['agreed_fee', 'deliverables_summary', 'rights_expires_at'] as const
const MATERIAL_FOR_CLIENT = ['deliverables_summary', 'client_visible_notes'] as const

export async function updateParticipationTerms(ctx: Ctx, participationId: string, input: unknown) {
  const v = parseInput(updateTermsSchema, input)
  const raw = (input ?? {}) as Record<string, unknown>
  return withTx(async (tx) => {
    const p = await lockParticipation(tx, participationId)
    await requireCampaign(tx, ctx, p.campaign_id, 'manage')
    if (p.version !== v.expected_version) throw versionConflict()
    if (['cancelled', 'completed'].includes(p.participation_status)) throw precondition('לא ניתן לעדכן תנאים להשתתפות שבוטלה או הושלמה')

    const next: Record<string, unknown> = {}
    if ('agreed_fee' in raw) {
      const fee = v.agreed_fee === null ? null : parseMoney(v.agreed_fee)
      if (fee !== null && fee < BigInt(0)) throw invalid('שכר לא יכול להיות שלילי')
      next.agreed_fee = fee === null ? null : toDecimal(fee)
    }
    for (const k of ['deliverables_summary', 'contract_reference', 'rights_expires_at', 'rights_notes', 'internal_notes', 'client_visible_notes'] as const) {
      if (k in raw) next[k] = (v as Record<string, unknown>)[k] ?? null
    }
    if (v.payment_status) next.payment_status = v.payment_status
    if ('agent_id' in raw) {
      if (v.agent_id) {
        const ok = await one(tx, `select 1 from cm_agent_creators where agent_id = $1 and creator_id = $2 and active`, [v.agent_id, p.creator_id])
        if (!ok) throw invalid('הסוכן אינו מורשה לייצג את היוצר')
      }
      next.agent_id = v.agent_id ?? null
    }
    if ('contract_signature_request_id' in raw) {
      if (v.contract_signature_request_id) {
        const sr = await one(tx, `select 1 from signature_requests where id = $1 and payload->>'source' = 'influencer-contract'`, [v.contract_signature_request_id])
        if (!sr) throw invalid('לא נמצא חוזה משפיען במערכת החתימות עם מזהה זה')
      }
      next.contract_signature_request_id = v.contract_signature_request_id ?? null
    }

    const cur = p as unknown as Record<string, unknown>
    const changed = (k: string) => k in next && String(next[k] ?? '') !== String(cur[k] ?? '')
    const creatorMaterial = MATERIAL_FOR_CREATOR.filter(changed)
    const clientMaterial = MATERIAL_FOR_CLIENT.filter(changed)
    const accepted = p.accepted_terms_version !== null && ['accepted', 'active'].includes(p.participation_status)
    const clientApproved = p.selection_status === 'approved'

    const sets: string[] = []
    const params: unknown[] = [participationId]
    for (const [k, val] of Object.entries(next)) { params.push(val); sets.push(`${k} = $${params.length}`) }
    if (creatorMaterial.length || clientMaterial.length) sets.push('terms_version = terms_version + 1')
    if (creatorMaterial.length && accepted) sets.push('creator_reacceptance_required = true')
    if (clientMaterial.length && clientApproved) sets.push('client_reapproval_required = true')
    if (!sets.length) return { id: participationId, version: p.version }
    sets.push('version = version + 1')
    await tx.query(`update cm_participations set ${sets.join(', ')} where id = $1`, params)
    const updated = await lockParticipation(tx, participationId)
    await syncFeeLine(tx, ctx, updated)
    if ('rights_expires_at' in next) await scheduleRightsJob(tx, updated, ctx.now)

    const flags = [
      creatorMaterial.length && accepted ? 'נדרש אישור מחדש מהיוצר' : '',
      clientMaterial.length && clientApproved ? 'נדרש אישור מחדש מהלקוח' : '',
    ].filter(Boolean)
    await audit(tx, ctx, {
      campaignId: p.campaign_id, entityType: 'participation', entityId: participationId,
      action: creatorMaterial.length || clientMaterial.length ? 'participation.terms_changed' : 'participation.updated',
      summary: creatorMaterial.length || clientMaterial.length
        ? `שינוי מהותי בתנאים (גרסת תנאים ${updated.terms_version})${flags.length ? ` — ${flags.join(', ')}` : ''}`
        : 'פרטי ההשתתפות עודכנו',
      changes: { fields: Object.keys(next), material: [...creatorMaterial, ...clientMaterial] },
    })
    if (creatorMaterial.length && accepted) {
      await ensureTask(tx, { automationKey: `p:${p.id}:reaccept:${updated.terms_version}`, campaignId: p.campaign_id, participationId: p.id,
        type: 'creator_reaccept', title: 'התנאים עודכנו: יש לאשר אותם מחדש', audience: 'creator' })
    }
    return { id: participationId, version: updated.version, terms_version: updated.terms_version }
  }, ctx.db)
}

// ── Manager actions ────────────────────────────────────────────────────────

export const participationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('invite'), expected_version: zVersion, via: z.enum(['creator', 'agent']).default('creator'),
    recipient_name: z.string().trim().min(1).max(200), recipient_email: zOptText(200), send_email: z.boolean().default(false) }),
  z.object({ action: z.literal('record_response'), expected_version: zVersion, response: z.enum(['accepted', 'declined']), note: z.string().trim().min(3, 'יש לתעד איך התקבלה התשובה').max(1000) }),
  z.object({ action: z.literal('activate'), expected_version: zVersion }),
  z.object({ action: z.literal('complete'), expected_version: zVersion }),
  z.object({ action: z.literal('cancel'), expected_version: zVersion, reason: z.string().trim().min(3, 'ביטול מחייב סיבה').max(1000) }),
  z.object({ action: z.literal('withdraw'), expected_version: zVersion, reason: z.string().trim().min(3, 'הסרה מחייבת סיבה').max(1000) }),
  z.object({ action: z.literal('repropose'), expected_version: zVersion }),
])

export async function participationAction(ctx: Ctx, participationId: string, input: unknown) {
  const v = parseInput(participationActionSchema, input)
  return withTx(async (tx) => {
    const p = await lockParticipation(tx, participationId)
    const acc = await requireCampaign(tx, ctx, p.campaign_id, 'manage')
    if (p.version !== v.expected_version) throw versionConflict()
    const creator = await one<{ display_name: string }>(tx, `select display_name from cm_creators where id = $1`, [p.creator_id])
    const label = creator?.display_name ?? ''
    let inviteUrl: string | null = null

    switch (v.action) {
      case 'invite': {
        if (p.selection_status !== 'approved') throw precondition('אפשר להזמין יוצר רק אחרי שהלקוח אישר אותו')
        if (p.participation_status !== 'invited') assertTransition(PARTICIPATION_MACHINE, p.participation_status, 'invited', 'השתתפות')
        if (v.via === 'agent' && !p.agent_id) throw invalid('אין סוכן משויך להשתתפות')
        const grant = await createGrantTx(tx, ctx, p.campaign_id, {
          kind: v.via, creator_id: v.via === 'creator' ? p.creator_id : undefined, agent_id: v.via === 'agent' ? p.agent_id ?? undefined : undefined,
          recipient_name: v.recipient_name, recipient_email: v.recipient_email, send_email: v.send_email,
        })
        inviteUrl = grant.inviteUrl
        await tx.query(`update cm_participations set participation_status = 'invited', invitation_status = 'sent', version = version + 1 where id = $1`, [p.id])
        await closeTasks(tx, { participationId: p.id, types: ['invite_creator'] }, 'done', ctx.now)
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.invited',
          summary: `נשלחה הזמנה ל-${label} (${v.via === 'agent' ? 'דרך הסוכן' : 'ישירות'})` })
        break
      }
      case 'record_response': {
        assertTransition(PARTICIPATION_MACHINE, p.participation_status, v.response, 'השתתפות')
        await applyResponse(tx, ctx, p, v.response, null)
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: `participation.${v.response}_recorded`,
          summary: `${v.response === 'accepted' ? 'אישור' : 'סירוב'} השתתפות תועד על ידי הצוות (לא דרך הפורטל): ${v.note}` })
        break
      }
      case 'activate':
        assertTransition(PARTICIPATION_MACHINE, p.participation_status, 'active', 'השתתפות')
        await tx.query(`update cm_participations set participation_status = 'active', version = version + 1 where id = $1`, [p.id])
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.activated', summary: `ההשתתפות של ${label} פעילה` })
        break
      case 'complete': {
        assertTransition(PARTICIPATION_MACHINE, p.participation_status, 'completed', 'השתתפות')
        const open = await one<{ n: number }>(tx, `select count(*)::int as n from cm_deliverables where participation_id = $1
          and status not in ('publication_verified','cancelled')`, [p.id])
        if ((open?.n ?? 0) > 0) throw precondition(`נותרו ${open!.n} תוצרים שלא אומת פרסומם או בוטלו`)
        await tx.query(`update cm_participations set participation_status = 'completed', version = version + 1 where id = $1`, [p.id])
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.completed', summary: `ההשתתפות של ${label} הושלמה` })
        break
      }
      case 'cancel': {
        assertTransition(PARTICIPATION_MACHINE, p.participation_status, 'cancelled', 'השתתפות')
        await tx.query(`update cm_participations set participation_status = 'cancelled', status_reason = $2, version = version + 1 where id = $1`, [p.id, v.reason])
        await cancelParticipationWork(tx, ctx, p.id, `ההשתתפות בוטלה: ${v.reason}`)
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.cancelled', summary: `ההשתתפות של ${label} בוטלה: ${v.reason}` })
        break
      }
      case 'withdraw': {
        assertTransition(SELECTION_MACHINE, p.selection_status, 'withdrawn', 'מועמד')
        if (!['not_invited', 'declined'].includes(p.participation_status)) throw precondition('היוצר כבר הוזמן; יש לבטל את ההשתתפות במקום להסיר מועמד')
        await tx.query(`update cm_participations set selection_status = 'withdrawn', status_reason = $2, version = version + 1 where id = $1`, [p.id, v.reason])
        await tx.query(`update cm_shortlist_items si set internal_decision = case when internal_decision = 'pending' then 'rejected' else internal_decision end
          from cm_shortlists s where s.id = si.shortlist_id and s.status in ('internal_review','client_review') and si.participation_id = $1`, [p.id])
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.withdrawn', summary: `${label} הוסר/ה מהמועמדים: ${v.reason}` })
        break
      }
      case 'repropose':
        assertTransition(SELECTION_MACHINE, p.selection_status, 'proposed', 'מועמד')
        await tx.query(`update cm_participations set selection_status = 'proposed', version = version + 1 where id = $1`, [p.id])
        await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id, action: 'participation.reproposed', summary: `${label} הוחזר/ה לרשימת המועמדים` })
        break
    }
    const updated = await lockParticipation(tx, p.id)
    await syncFeeLine(tx, ctx, updated)
    void acc
    return { id: p.id, version: updated.version, invite_url: inviteUrl }
  }, ctx.db)
}

/** Accept/decline: shared by the portal and by the manager recording an offline answer. */
async function applyResponse(tx: Queryable, ctx: Ctx, p: ParticipationRow, response: 'accepted' | 'declined', grantId: string | null) {
  if (response === 'accepted') {
    await tx.query(`update cm_participations set participation_status = 'accepted', invitation_status = 'responded',
        accepted_terms_version = terms_version, accepted_at = $2, accepted_by_grant_id = $3, creator_reacceptance_required = false,
        version = version + 1 where id = $1`, [p.id, ctx.now, grantId])
    await onParticipationAccepted(tx, ctx, p)
  } else {
    await tx.query(`update cm_participations set participation_status = 'declined', invitation_status = 'responded', version = version + 1 where id = $1`, [p.id])
    const owner = await ownerRecipient(tx, p.campaign_id)
    await ensureTask(tx, { automationKey: `p:${p.id}:declined:${ctx.now.getTime()}`, campaignId: p.campaign_id, participationId: p.id,
      type: 'participation_declined', title: 'יוצר/ת סירב/ה להשתתף: יש למצוא חלופה', assigneeUserId: owner?.userId ?? null, priority: 'high' })
  }
}

/** Automation 2: participation accepted → deliverable tasks, reminders, committed fee. */
export async function onParticipationAccepted(tx: Queryable, ctx: Ctx, p: ParticipationRow) {
  const ds = await many<{ id: string; title: string; status: string; submission_due_at: Date | null; publication_due_at: Date | null; campaign_id: string; participation_id: string }>(tx,
    `select id, title, status, submission_due_at, publication_due_at, campaign_id, participation_id from cm_deliverables
      where participation_id = $1 and status = 'awaiting_submission'`, [p.id])
  for (const d of ds) {
    await ensureTask(tx, { automationKey: `d:${d.id}:submit`, campaignId: p.campaign_id, participationId: p.id, deliverableId: d.id,
      type: 'submit_content', title: `הגשת תוכן: ${d.title}`, audience: 'creator', dueAt: d.submission_due_at })
    await scheduleSubmissionJobs(tx, d, ctx.now)
  }
  const owner = await ownerRecipient(tx, p.campaign_id)
  const camp = await one<{ name: string }>(tx, `select name from cm_campaigns where id = $1`, [p.campaign_id])
  const cr = await one<{ display_name: string }>(tx, `select display_name from cm_creators where id = $1`, [p.creator_id])
  await sendTo(tx, [owner], {
    campaignId: p.campaign_id, key: `p:${p.id}:accepted:${p.terms_version}`, correlationId: randomUUID(),
    subject: `${cr?.display_name} אישר/ה השתתפות בקמפיין "${camp?.name}"`,
    body: `${cr?.display_name} אישר/ה את תנאי ההשתתפות (גרסת תנאים ${p.terms_version}).`,
    internalPath: `/campaigns/${p.campaign_id}?tab=creators`, portalPath: null,
  }, ctx.now)
}

export async function cancelParticipationWork(tx: Queryable, ctx: Ctx, participationId: string, reason: string) {
  const ds = await many<{ id: string }>(tx, `update cm_deliverables set status = 'cancelled', status_reason = $2, version = version + 1
      where participation_id = $1 and status not in ('publication_verified','cancelled') returning id`, [participationId, reason])
  for (const d of ds) await cancelJobs(tx, { subjectId: d.id }, reason)
  await cancelJobs(tx, { subjectId: participationId }, reason)
  await closeTasks(tx, { participationId }, 'cancelled', ctx.now, reason)
}

// ── Portal: creator / agent responds ───────────────────────────────────────

export async function respondToInvitation(ctx: Ctx, participationId: string, input: unknown) {
  const actor: PortalActor = requirePortal(ctx.actor)
  const v = parseInput(z.object({ response: z.enum(['accepted', 'declined']), terms_version: z.number().int().positive() }), input)
  return withTx(async (tx) => {
    await requirePortalParticipation(tx, actor, participationId)
    const p = await lockParticipation(tx, participationId)
    if (p.terms_version !== v.terms_version) {
      throw new DomainError('STALE_TARGET', 'התנאים עודכנו מאז שפתחת את הדף. רעננו ובדקו את התנאים החדשים לפני האישור.')
    }
    const reaccept = p.creator_reacceptance_required && v.response === 'accepted' && ['accepted', 'active'].includes(p.participation_status)
    if (reaccept) {
      await tx.query(`update cm_participations set accepted_terms_version = terms_version, accepted_at = $2, accepted_by_grant_id = $3,
          creator_reacceptance_required = false, version = version + 1 where id = $1`, [p.id, ctx.now, actor.grantId])
      await closeTasks(tx, { participationId: p.id, types: ['creator_reaccept'] }, 'done', ctx.now)
    } else {
      if (p.participation_status === v.response) return { id: p.id, status: p.participation_status, idempotent: true }
      assertTransition(PARTICIPATION_MACHINE, p.participation_status, v.response, 'השתתפות')
      await applyResponse(tx, ctx, p, v.response, actor.grantId)
    }
    const updated = await lockParticipation(tx, p.id)
    await syncFeeLine(tx, ctx, updated)
    await audit(tx, ctx, { campaignId: p.campaign_id, entityType: 'participation', entityId: p.id,
      action: v.response === 'accepted' ? 'participation.accepted' : 'participation.declined',
      summary: `${v.response === 'accepted' ? 'אישור' : 'סירוב'} השתתפות דרך הפורטל, גרסת תנאים ${p.terms_version} (מיוחס למחזיק/ת קישור ההזמנה)` })
    return { id: p.id, status: updated.participation_status }
  }, ctx.db)
}

// ── Internal list view ─────────────────────────────────────────────────────

export async function listCampaignParticipations(ctx: Ctx, campaignId: string) {
  await requireCampaign(ctx.db, ctx, campaignId, 'operate')
  return many(ctx.db,
    `select p.id, p.creator_id, cr.display_name as creator_name, p.agent_id, a.display_name as agent_name,
            p.selection_status, p.participation_status, p.status_reason, p.agreed_fee::text, p.currency, p.payment_status,
            p.contract_reference, p.contract_signature_request_id, to_char(p.rights_expires_at,'YYYY-MM-DD') as rights_expires_at,
            p.rights_notes, p.internal_notes, p.client_visible_notes, p.deliverables_summary, p.terms_version,
            p.accepted_terms_version, p.creator_reacceptance_required, p.client_reapproval_required, p.version,
            coalesce((select json_agg(json_build_object('platform', s.platform, 'handle', s.handle, 'follower_count', s.follower_count))
               from cm_creator_social_accounts s where s.creator_id = cr.id), '[]') as accounts,
            (select count(*)::int from cm_deliverables d where d.participation_id = p.id and d.status <> 'cancelled') as deliverables,
            (select count(*)::int from cm_deliverables d where d.participation_id = p.id and d.status = 'publication_verified') as deliverables_verified,
            (select min(d.submission_due_at) from cm_deliverables d where d.participation_id = p.id and d.status in ('awaiting_submission','changes_requested')) as next_submission_due,
            (select min(d.publication_due_at) from cm_deliverables d where d.participation_id = p.id and d.status = 'approved') as next_publication_due,
            sh.status as shipment_status, sh.id as shipment_id
       from cm_participations p
       join cm_creators cr on cr.id = p.creator_id
       left join cm_agents a on a.id = p.agent_id
       left join cm_shipments sh on sh.participation_id = p.id
      where p.campaign_id = $1
      order by case p.selection_status when 'approved' then 0 when 'client_review' then 1 when 'internal_review' then 2 when 'proposed' then 3 else 4 end,
               cr.display_name`, [campaignId])
}
