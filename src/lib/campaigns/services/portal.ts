/** Portal home: what this grant may see, shaped for its role only. */
import type { Ctx } from '../context'
import { many, one } from '../db'
import { notFound } from '../errors'
import { requireClientCampaign, requirePortal } from '../auth/policy'
import { clientPublishedReports, } from './reporting'
import { clientShortlists } from './shortlists'
import { portalParticipations } from './deliverables'

export async function portalHome(ctx: Ctx) {
  const actor = requirePortal(ctx.actor)
  const campaign = await one<{ id: string; name: string; status: string; start_date: string | null; end_date: string | null; client_name: string }>(ctx.db,
    `select c.id, c.name, c.status, to_char(c.start_date,'YYYY-MM-DD') as start_date, to_char(c.end_date,'YYYY-MM-DD') as end_date,
            coalesce(cl.name_hebrew, cl.name) as client_name
       from cm_campaigns c join clients cl on cl.id = c.client_id where c.id = $1`, [actor.campaignId])
  if (!campaign) throw notFound('הקמפיין')
  const me = { name: actor.name, kind: actor.grantKind }

  if (actor.grantKind === 'client') {
    await requireClientCampaign(ctx.db, actor)
    const [shortlists, reports] = await Promise.all([clientShortlists(ctx), clientPublishedReports(ctx)])
    // Content released to the client (internally approved at least once), with a general status only.
    const deliverables = await many(ctx.db,
      `select d.id, d.title, d.platform, d.type, d.status, d.publication_due_at, cr.display_name as creator_name,
              (d.status = 'client_review') as awaiting_you
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status <> 'cancelled'
          and exists (select 1 from cm_approval_decisions a join cm_content_versions v on v.id = a.target_id
                       where a.target_type = 'content_version' and v.deliverable_id = d.id and a.approval_stage = 'internal' and a.decision = 'approved')
        order by (d.status = 'client_review') desc, d.publication_due_at nulls last`, [actor.campaignId])
    const progress = await one(ctx.db,
      `select count(*) filter (where status <> 'cancelled')::int as planned,
              count(*) filter (where status in ('approved','publication_reported','publication_verified'))::int as approved,
              count(*) filter (where status = 'publication_verified')::int as published
         from cm_deliverables where campaign_id = $1`, [actor.campaignId])
    return { me, campaign, shortlists, deliverables, reports, progress }
  }
  return { me, campaign, ...(await portalParticipations(ctx)) }
}
