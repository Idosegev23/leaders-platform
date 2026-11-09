/**
 * Authorization and data separation (required tests 4, 5, 6, 7, 18, 19) plus
 * DB-level grants and staff limits.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { PNG_1PX, makeClient, makeUser, makeWorld, portalFromInvite, testPool, tokenFromInvite, type World } from './helpers'
import type { InternalActor, PortalActor } from '../context'
import { DomainError } from '../errors'
import { createCampaign, getCampaign, listCampaigns, updateCampaign } from '../services/campaigns'
import { createAgent, createCreator } from '../services/creators'
import { addCreatorsToCampaign, participationAction, respondToInvitation, updateParticipationTerms } from '../services/participations'
import { clientShortlistDecision, clientShortlists, createShortlist, internalShortlistDecision, sendShortlistToClient } from '../services/shortlists'
import { createDeliverable, getDeliverable, internalContentDecision, portalParticipations, submitVersion } from '../services/deliverables'
import { completeUpload, createUploadIntent, getAssetUrl } from '../services/assets'
import { createGrant, reissueGrant, revokeGrant } from '../services/grants'
import { getBudget, addBudgetLine } from '../services/budget'
import { getInternalReport } from '../services/reporting'
import { redeemToken, resolvePortalSession } from '../portal/access'

let pool: Pool
let w: World
let managerA: InternalActor, managerB: InternalActor, staffA: InternalActor, outsider: InternalActor
const now = new Date('2026-11-05T09:00:00Z')

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'OK'
  } catch (e) {
    if (e instanceof DomainError) return e.code
    throw e
  }
}

/** A campaign with one approved, invited, accepted creator and one deliverable with an internally approved version. */
async function buildCampaign(manager: InternalActor, clientName: string, creatorName: string, opts: { viaAgent?: string } = {}) {
  const clientId = await makeClient(pool, clientName)
  const { id: campaignId } = await createCampaign(w.ctx(manager, now), { client_id: clientId, name: `${clientName} campaign`, approved_budget: '10000' })
  const cr = await createCreator(w.ctx(manager), { display_name: creatorName, email: `${creatorName}@example.test`, agent_id: opts.viaAgent ?? null })
  const [pid] = (await addCreatorsToCampaign(w.ctx(manager, now), campaignId, { creator_ids: [cr.id] })).added
  await updateParticipationTerms(w.ctx(manager, now), pid, { expected_version: 1, agreed_fee: '4321', internal_notes: 'סוד פנימי: מרווח 30%' })
  const sl = await createShortlist(w.ctx(manager, now), campaignId, { participation_ids: [pid] })
  const item = (await pool.query(`select id from cm_shortlist_items where shortlist_id = $1`, [sl.id])).rows[0].id
  await internalShortlistDecision(w.ctx(manager, now), sl.id, item, { decision: 'approved', shortlist_version: 1 })
  const clientGrant = await createGrant(w.ctx(manager, now), campaignId, { kind: 'client', recipient_name: 'rep', recipient_email: `rep@${clientName}.example` })
  const client = await portalFromInvite(pool, clientGrant.inviteUrl, now)
  await sendShortlistToClient(w.ctx(manager, now), sl.id)
  await clientShortlistDecision(w.ctx(client, now), item, { decision: 'approved', shortlist_version: 1 })
  const { id: did } = await createDeliverable(w.ctx(manager, now), pid, { title: 'פוסט', type: 'post', platform: 'instagram', submission_due_at: '2026-11-20T12:00' })
  const pv = (await pool.query(`select version from cm_participations where id = $1`, [pid])).rows[0].version
  const inv = await participationAction(w.ctx(manager, now), pid, opts.viaAgent
    ? { action: 'invite', expected_version: pv, via: 'agent', recipient_name: 'agent', recipient_email: null }
    : { action: 'invite', expected_version: pv, recipient_name: creatorName, recipient_email: null })
  const creator = await portalFromInvite(pool, inv.invite_url!, now)
  const tv = (await pool.query(`select terms_version from cm_participations where id = $1`, [pid])).rows[0].terms_version
  await respondToInvitation(w.ctx(creator, now), pid, { response: 'accepted', terms_version: tv })
  const intent = await createUploadIntent(w.ctx(creator, now), { participation_id: pid, purpose: 'content', filename: 'a.png', mime_type: 'image/png', size: PNG_1PX.length })
  const key = (await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])).rows[0].storage_key
  await w.storage.write(key, PNG_1PX, 'image/png')
  await completeUpload(w.ctx(creator, now), intent.asset_id)
  const v = await submitVersion(w.ctx(creator, now), did, { asset_id: intent.asset_id })
  await internalContentDecision(w.ctx(manager, now), did, { version_id: v.version_id, decision: 'approved' })
  return { clientId, campaignId, pid, did, assetId: intent.asset_id, client, creator, versionId: v.version_id }
}

let A: Awaited<ReturnType<typeof buildCampaign>>
let B: Awaited<ReturnType<typeof buildCampaign>>

beforeAll(async () => {
  pool = testPool()
  w = makeWorld(pool)
  managerA = await makeUser(pool, 'manager', 'managerA')
  managerB = await makeUser(pool, 'manager', 'managerB')
  staffA = await makeUser(pool, 'staff', 'staffA')
  outsider = await makeUser(pool, 'none', 'outsider')
  await pool.query(`delete from cm_staff_roles where user_id = $1`, [outsider.userId])
  A = await buildCampaign(managerA, 'clientA', 'creatorA')
  B = await buildCampaign(managerB, 'clientB', 'creatorB')
  await pool.query(`insert into cm_campaign_members (campaign_id, user_id, role) values ($1,$2,'staff')`, [A.campaignId, staffA.userId])
})
afterAll(async () => { await pool.end() })

describe('client separation (test 4)', () => {
  it("client A cannot read or act on client B's campaign", async () => {
    // a client grant is pinned to its own campaign; B's ids are simply not reachable
    expect(await code(getDeliverable(w.ctx(A.client), B.did))).toBe('NOT_FOUND')
    expect(await code(getAssetUrl(w.ctx(A.client), B.assetId))).toBe('NOT_FOUND')
    const bItem = (await pool.query(`select si.id from cm_shortlist_items si join cm_shortlists s on s.id = si.shortlist_id where s.campaign_id = $1`, [B.campaignId])).rows[0].id
    expect(await code(clientShortlistDecision(w.ctx(A.client), bItem, { decision: 'rejected', feedback: 'x', shortlist_version: 1 }))).toBe('NOT_FOUND')
    const lists = await clientShortlists(w.ctx(A.client))
    expect(lists.flatMap((l) => l.items).every((i: Record<string, unknown>) => !JSON.stringify(i).includes('creatorB'))).toBe(true)
  })

  it('a client grant whose campaign was moved to another client loses access', async () => {
    const other = await makeClient(pool, 'other')
    await pool.query(`update cm_campaigns set client_id = $2 where id = $1`, [A.campaignId, other])
    expect(await code(clientShortlists(w.ctx(A.client)))).toBe('NOT_FOUND')
    await pool.query(`update cm_campaigns set client_id = $2 where id = $1`, [A.campaignId, A.clientId])
  })

  it("internal managers only see their own campaigns", async () => {
    expect(await code(getCampaign(w.ctx(managerB), A.campaignId))).toBe('NOT_FOUND')
    expect(await code(updateCampaign(w.ctx(managerB), A.campaignId, { expected_version: 1, name: 'hijack' }))).toBe('NOT_FOUND')
    const list = await listCampaigns(w.ctx(managerB), {})
    expect(list.rows.map((r) => r.id)).not.toContain(A.campaignId)
    expect(await code(listCampaigns(w.ctx(A.client), {}))).toBe('UNAUTHENTICATED')
  })
})

describe('creator and agent scope (tests 5, 6)', () => {
  it("creator A cannot reach creator B's deliverable or participation by changing ids", async () => {
    expect(await code(getDeliverable(w.ctx(A.creator), B.did))).toBe('NOT_FOUND')
    expect(await code(submitVersion(w.ctx(A.creator), B.did, { external_url: 'https://x.example/v' }))).toBe('NOT_FOUND')
    expect(await code(respondToInvitation(w.ctx(A.creator), B.pid, { response: 'declined', terms_version: 1 }))).toBe('NOT_FOUND')
    expect(await code(createUploadIntent(w.ctx(A.creator), { participation_id: B.pid, purpose: 'content', filename: 'x.png', mime_type: 'image/png', size: 10 }))).toBe('NOT_FOUND')
    expect(await code(getAssetUrl(w.ctx(A.creator), B.assetId))).toBe('NOT_FOUND')
    // asset of B cannot be attached to A's deliverable either
    expect(await code(submitVersion(w.ctx(A.creator), A.did, { asset_id: B.assetId }))).toBe('VALIDATION')
  })

  it('a second creator in the SAME campaign cannot see the first one', async () => {
    const cr2 = await createCreator(w.ctx(managerA), { display_name: 'second', email: 'second@example.test' })
    const grant = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'x' })
    void grant
    const [p2] = (await addCreatorsToCampaign(w.ctx(managerA, now), A.campaignId, { creator_ids: [cr2.id] })).added
    await pool.query(`update cm_participations set selection_status = 'approved', participation_status = 'invited' where id = $1`, [p2])
    const g2 = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'creator', creator_id: cr2.id, recipient_name: 'second' })
    const second = await portalFromInvite(pool, g2.inviteUrl, now)
    expect(await code(getDeliverable(w.ctx(second), A.did))).toBe('NOT_FOUND')
    const mine = await portalParticipations(w.ctx(second))
    expect(mine.participations.map((p) => p.id)).toEqual([p2])
  })

  it('an agent sees only creators they are authorized to represent (test 6)', async () => {
    const agent = await createAgent(w.ctx(managerA), { display_name: 'סוכנות כוכבים', email: 'agency@example.test' })
    const repped = await createCreator(w.ctx(managerA), { display_name: 'מיוצגת', email: 'repped@example.test', agent_id: agent.id })
    const notRepped = await createCreator(w.ctx(managerA), { display_name: 'לא מיוצגת', email: 'free@example.test' })
    const added = (await addCreatorsToCampaign(w.ctx(managerA, now), A.campaignId, { creator_ids: [repped.id, notRepped.id] })).added
    // even if someone sets the agent on a participation it does not represent, the active link is required
    await pool.query(`update cm_participations set agent_id = $2, selection_status = 'approved', participation_status = 'invited' where id = any($1)`, [added, agent.id])
    const g = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'agent', agent_id: agent.id, recipient_name: 'agent' })
    const agentActor = await portalFromInvite(pool, g.inviteUrl, now)
    const mine = await portalParticipations(w.ctx(agentActor))
    expect(mine.participations.map((p: Record<string, unknown>) => p.creator_name)).toEqual(['מיוצגת'])
    // revoking the representation cuts access immediately
    await pool.query(`update cm_agent_creators set active = false where agent_id = $1`, [agent.id])
    expect((await portalParticipations(w.ctx(agentActor))).participations).toEqual([])
    expect(await code(getDeliverable(w.ctx(agentActor), A.did))).toBe('NOT_FOUND')
  })
})

describe('internal data never reaches the client portal (test 7)', () => {
  it('client views contain no fee, budget or internal notes', async () => {
    const lists = await clientShortlists(w.ctx(A.client))
    const view = await getDeliverable(w.ctx(A.client), A.did)
    const blob = JSON.stringify({ lists, view })
    expect(blob).not.toContain('4321')
    expect(blob).not.toContain('סוד פנימי')
    expect(blob).not.toMatch(/agreed_fee|internal_notes|approved_budget|assigned_reviewer/)
    expect(await code(getBudget(w.ctx(A.client), A.campaignId))).toBe('UNAUTHENTICATED')
    expect(await code(getInternalReport(w.ctx(A.client), A.campaignId))).toBe('UNAUTHENTICATED')
  })

  it('creators see their own fee but not internal notes or internal comments', async () => {
    const mine = await portalParticipations(w.ctx(A.creator))
    const blob = JSON.stringify(mine)
    expect(blob).toContain('4321')
    expect(blob).not.toContain('סוד פנימי')
  })
})

describe('staff limits', () => {
  it('staff can view but cannot approve, invite or touch money', async () => {
    expect((await getCampaign(w.ctx(staffA), A.campaignId)).access_level).toBe('operate')
    expect(await code(addBudgetLine(w.ctx(staffA), A.campaignId, { category: 'misc', description: 'x', amount: '1' }))).toBe('FORBIDDEN')
    expect(await code(internalContentDecision(w.ctx(staffA), A.did, { version_id: A.versionId, decision: 'approved' }))).toBe('FORBIDDEN')
    expect(await code(createGrant(w.ctx(staffA), A.campaignId, { kind: 'client', recipient_name: 'x' }))).toBe('FORBIDDEN')
    expect(await code(getCampaign(w.ctx(staffA), B.campaignId))).toBe('NOT_FOUND')
  })
})

describe('signed URLs (test 18)', () => {
  it('authorized users get a short-lived URL; others get nothing', async () => {
    const ok = await getAssetUrl(w.ctx(managerA), A.assetId)
    expect(ok.url).toMatch(/op=get/)
    expect(ok.expires_in).toBeLessThanOrEqual(300)
    expect(await code(getAssetUrl(w.ctx(managerB), A.assetId))).toBe('NOT_FOUND')
    expect(await code(getAssetUrl(w.ctx(outsider), A.assetId))).toBe('NOT_FOUND')
    expect(await code(getAssetUrl(w.ctx(B.creator), A.assetId))).toBe('NOT_FOUND')
    // the client may download content that was released to them
    expect((await getAssetUrl(w.ctx(A.client), A.assetId)).url).toBeTruthy()
    // a forged or expired local URL is refused by the signature check
    const u = new URL(ok.url)
    expect(w.storage.verify('get', u.searchParams.get('key')!, Number(u.searchParams.get('exp')), u.searchParams.get('sig')!)).toBe(true)
    expect(w.storage.verify('get', `${B.campaignId}/x.png`, Number(u.searchParams.get('exp')), u.searchParams.get('sig')!)).toBe(false)
    expect(w.storage.verify('get', u.searchParams.get('key')!, Date.now() - 1, u.searchParams.get('sig')!)).toBe(false)
  })
})

describe('invitation tokens (test 19)', () => {
  it('a token works once, and only while the grant is valid', async () => {
    const g = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'one-time' })
    const t = tokenFromInvite(g.inviteUrl)
    const first = await redeemToken(pool, t, now)
    expect(first.sessionSecret).toBeTruthy()
    expect(await code(redeemToken(pool, t, now))).toBe('UNAUTHENTICATED') // reuse
    // only the hash is stored
    const raw = await pool.query(`select count(*)::int as n from cm_portal_tokens where token_hash = $1`, [t])
    expect(raw.rows[0].n).toBe(0)
  })

  it('an expired token does not grant access', async () => {
    const g = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'late' })
    const later = new Date(now.getTime() + 15 * 86_400_000)
    expect(await code(redeemToken(pool, tokenFromInvite(g.inviteUrl), later))).toBe('UNAUTHENTICATED')
  })

  it('revoking a grant kills unused links and live sessions; reissue invalidates the old link', async () => {
    const g = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'to revoke' })
    const { sessionSecret } = await redeemToken(pool, tokenFromInvite(g.inviteUrl), now)
    expect(await resolvePortalSession(pool, sessionSecret, now)).not.toBeNull()
    const re = await reissueGrant(w.ctx(managerA, now), g.grantId)
    const g2 = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'old link' })
    await reissueGrant(w.ctx(managerA, now), g2.grantId)
    expect(await code(redeemToken(pool, tokenFromInvite(g2.inviteUrl), now))).toBe('UNAUTHENTICATED')
    await revokeGrant(w.ctx(managerA, now), g.grantId)
    expect(await resolvePortalSession(pool, sessionSecret, now)).toBeNull()
    expect(await code(redeemToken(pool, tokenFromInvite(re.inviteUrl), now))).toBe('UNAUTHENTICATED')
  })

  it('a session expires with its grant', async () => {
    const g = await createGrant(w.ctx(managerA, now), A.campaignId, { kind: 'client', recipient_name: 'expiring' })
    const { sessionSecret } = await redeemToken(pool, tokenFromInvite(g.inviteUrl), now)
    await pool.query(`update cm_portal_grants set expires_at = $2 where id = $1`, [g.grantId, new Date(now.getTime() + 60_000)])
    expect(await resolvePortalSession(pool, sessionSecret, new Date(now.getTime() + 120_000))).toBeNull()
  })
})

describe('database grants', () => {
  it('browser roles (anon/authenticated) cannot read or write any cm_ table', async () => {
    const client = await pool.connect()
    try {
      for (const role of ['anon', 'authenticated']) {
        await client.query(`set role ${role}`)
        for (const t of ['cm_campaigns', 'cm_participations', 'cm_portal_tokens', 'cm_budget_lines', 'cm_audit_events']) {
          await expect(client.query(`select 1 from ${t} limit 1`)).rejects.toThrow(/permission denied/)
        }
        await expect(client.query(`insert into cm_campaigns (client_id, name, owner_user_id, created_by) values (gen_random_uuid(), 'x', gen_random_uuid(), gen_random_uuid())`)).rejects.toThrow(/permission denied/)
        await client.query('reset role')
      }
      const rls = await client.query(`select count(*)::int as n from pg_tables where schemaname = 'public' and tablename like 'cm\\_%' and not rowsecurity`)
      expect(rls.rows[0].n).toBe(0)
    } finally {
      await client.query('reset role').catch(() => {})
      client.release()
    }
  })

  it('audit events and approval decisions are append-only', async () => {
    await expect(pool.query(`update cm_audit_events set summary = 'x' where campaign_id = $1`, [A.campaignId])).rejects.toThrow(/append-only/)
    await expect(pool.query(`delete from cm_approval_decisions where campaign_id = $1`, [A.campaignId])).rejects.toThrow(/append-only/)
    await expect(pool.query(`update cm_content_versions set caption = 'x' where deliverable_id = $1`, [A.did])).rejects.toThrow(/immutable/)
  })
})

void ({} as PortalActor)
