/** Portal home: what this grant may see, shaped for its role only. */
import type { Ctx } from '../context'
import { many, one } from '../db'
import { clientCampaignScope, isUuid, requireClientCampaign, requirePortal } from '../auth/policy'
import { clientPublishedReports } from './reporting'
import { clientShortlists } from './shortlists'
import { portalParticipations } from './deliverables'

export async function portalHome(ctx: Ctx, campaignId?: string | null) {
  const actor = requirePortal(ctx.actor)
  const me = { name: actor.name, kind: actor.grantKind, orgName: actor.orgName, allCampaigns: actor.campaignId === null }
  const selected = campaignId && isUuid(campaignId) ? campaignId : null

  if (actor.grantKind === 'client') {
    const campaigns = await many<{ id: string; name: string; status: string; start_date: string | null; end_date: string | null; client_name: string; awaiting: number }>(ctx.db,
      `select c.id, c.name, c.status, to_char(c.start_date,'YYYY-MM-DD') as start_date, to_char(c.end_date,'YYYY-MM-DD') as end_date,
              cl.name as client_name,
              ((select count(*)::int from cm_deliverables d where d.campaign_id = c.id and d.status = 'client_review')
               + (select count(*)::int from cm_shortlist_items si join cm_shortlists s on s.id = si.shortlist_id
                   where s.campaign_id = c.id and s.status = 'client_review' and si.internal_decision = 'approved' and si.client_decision = 'pending')) as awaiting
         from cm_campaigns c join cm_clients cl on cl.id = c.client_id
        where ${clientCampaignScope('$1', '$2', '$3')} and c.status <> 'cancelled'
        order by c.start_date desc nulls last, c.created_at desc`, [actor.orgId, actor.clientId, actor.campaignId])
    const current = selected ?? campaigns[0]?.id ?? null
    if (!current) return { me, campaigns, campaign: null }
    const campaign = await requireClientCampaign(ctx.db, actor, current)
    const [shortlists, reports] = await Promise.all([clientShortlists(ctx, current), clientPublishedReports(ctx, current)])
    // Content released to the client (internally approved at least once), with a general status only.
    const deliverables = await many(ctx.db,
      `select d.id, d.title, d.platform, d.type, d.status, d.publication_due_at, cr.display_name as creator_name,
              (d.status = 'client_review') as awaiting_you
         from cm_deliverables d join cm_participations p on p.id = d.participation_id join cm_creators cr on cr.id = p.creator_id
        where d.campaign_id = $1 and d.status <> 'cancelled'
          and exists (select 1 from cm_approval_decisions a join cm_content_versions v on v.id = a.target_id
                       where a.target_type = 'content_version' and v.deliverable_id = d.id and a.approval_stage = 'internal' and a.decision = 'approved')
        order by (d.status = 'client_review') desc, d.publication_due_at nulls last`, [current])
    const progress = await one(ctx.db,
      `select count(*) filter (where status <> 'cancelled')::int as planned,
              count(*) filter (where status in ('approved','publication_reported','publication_verified'))::int as approved,
              count(*) filter (where status = 'publication_verified')::int as published
         from cm_deliverables where campaign_id = $1`, [current])
    const full = campaigns.find((c) => c.id === current) ?? { ...campaign, start_date: null, end_date: null, client_name: '', awaiting: 0 }
    return { me, campaigns, campaign: full, shortlists, deliverables, reports, progress }
  }

  const data = await portalParticipations(ctx, selected)
  return { me, selectedCampaignId: selected, ...data }
}
