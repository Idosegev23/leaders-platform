/**
 * Multi-tenancy: organization isolation (services AND database), staff
 * sign-in, multi-campaign client and agency invitations, Hub-only features.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { PNG_1PX, addMembership, makeBrief, makeClient, makeOrg, makeUser, makeWorld, portalFromInvite, testPool, tokenFromInvite, type Org, type World } from './helpers'
import type { InternalActor } from '../context'
import { DomainError } from '../errors'
import { changeCampaignStatus, createCampaign, getCampaign, listCampaigns, listStaff, updateCampaign } from '../services/campaigns'
import { createClient, searchBriefs, searchClients, searchHubClients } from '../services/clients'
import { createAgent, createCreator, createTalentAgency, getCreator, listCreators, listTalentAgencies, setAgentCreator } from '../services/creators'
import { addCreatorsToCampaign, participationAction, respondToInvitation, updateParticipationTerms } from '../services/participations'
import { createShortlist, internalShortlistDecision, sendShortlistToClient, clientShortlistDecision } from '../services/shortlists'
import { createDeliverable, getDeliverable, portalParticipations, submitVersion } from '../services/deliverables'
import { completeUpload, createUploadIntent, getAssetUrl } from '../services/assets'
import { createGrant, createOrgGrant, listGrants } from '../services/grants'
import { getBudget } from '../services/budget'
import { listTasks } from '../services/tasks'
import { getInternalReport } from '../services/reporting'
import { portalHome } from '../services/portal'
import { createOrganization, inviteMember, listMembers, updateMember } from '../services/admin'
import { actorFor, loadMemberships, redeemLoginToken, requestStaffLoginLink, resolveAccountSession } from '../auth/accounts'
import { redeemToken, resolvePortalSession } from '../portal/access'

let pool: Pool
let w: World
const now = new Date('2026-11-10T09:00:00Z')

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return 'OK' } catch (e) { if (e instanceof DomainError) return e.code; throw e }
}

interface Tenant { org: Org; manager: InternalActor; clientId: string; campaignId: string; creatorId: string; pid: string; did: string; assetId: string }

async function tenant(name: string, opts: { hub?: boolean } = {}): Promise<Tenant> {
  const org = await makeOrg(pool, name, opts)
  const manager = await makeUser(pool, 'manager', `mgr-${name}`, org)
  const clientId = await makeClient(pool, `client-${name}`, org)
  const { id: campaignId } = await createCampaign(w.ctx(manager, now), { client_id: clientId, name: `campaign-${name}` })
  const { id: creatorId } = await createCreator(w.ctx(manager), { display_name: `creator-${name}`, email: 'same.person@example.test' })
  const [pid] = (await addCreatorsToCampaign(w.ctx(manager, now), campaignId, { creator_ids: [creatorId] })).added
  await updateParticipationTerms(w.ctx(manager, now), pid, { expected_version: 1, agreed_fee: '1000' })
  const { id: did } = await createDeliverable(w.ctx(manager, now), pid, { title: 'post', type: 'post', platform: 'instagram' })
  const intent = await createUploadIntent(w.ctx(manager, now), { participation_id: pid, purpose: 'content', filename: 'a.png', mime_type: 'image/png', size: PNG_1PX.length })
  const key = (await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])).rows[0].storage_key
  await w.storage.write(key, PNG_1PX, 'image/png')
  await completeUpload(w.ctx(manager, now), intent.asset_id)
  return { org, manager, clientId, campaignId, creatorId, pid, did, assetId: intent.asset_id }
}

let A: Tenant
let B: Tenant

beforeAll(async () => {
  pool = testPool()
  w = makeWorld(pool)
  A = await tenant('alpha', { hub: true })
  B = await tenant('beta')
})
afterAll(async () => { await pool.end() })

describe('organization isolation (services)', () => {
  it('a manager in B cannot see or change anything of A, even with A ids', async () => {
    const b = w.ctx(B.manager)
    expect(await code(getCampaign(b, A.campaignId))).toBe('NOT_FOUND')
    expect(await code(updateCampaign(b, A.campaignId, { expected_version: 1, name: 'x' }))).toBe('NOT_FOUND')
    expect((await listCampaigns(b, {})).rows.map((r) => r.id)).toEqual([B.campaignId])
    expect(await code(getCreator(b, A.creatorId))).toBe('NOT_FOUND')
    expect((await listCreators(b, {})).rows.map((r) => r.id)).toEqual([B.creatorId])
    expect((await searchClients(b, '')).map((c) => c.id)).toEqual([B.clientId])
    expect(await code(getBudget(b, A.campaignId))).toBe('NOT_FOUND')
    expect(await code(getInternalReport(b, A.campaignId))).toBe('NOT_FOUND')
    expect(await code(getDeliverable(b, A.did))).toBe('NOT_FOUND')
    expect(await code(getAssetUrl(b, A.assetId))).toBe('NOT_FOUND')
    expect(await code(listGrants(b, A.campaignId))).toBe('NOT_FOUND')
    expect((await listTasks(b, {})).rows.every((t: Record<string, unknown>) => t.campaign_id === B.campaignId)).toBe(true)
    expect((await listStaff(b)).map((s) => s.id)).toEqual([B.manager.userId])
  })

  it('B cannot use A records to build its own data', async () => {
    const b = w.ctx(B.manager, now)
    // A's client for a B campaign
    expect(await code(createCampaign(b, { client_id: A.clientId, name: 'steal' }))).toBe('VALIDATION')
    // A's creator into a B campaign
    expect(await code(addCreatorsToCampaign(b, B.campaignId, { creator_ids: [A.creatorId] }))).toBe('VALIDATION')
    // A's manager as owner of a B campaign
    expect(await code(createCampaign(b, { client_id: B.clientId, name: 'x', owner_user_id: A.manager.userId }))).toBe('VALIDATION')
    // A's creator in a B invitation
    expect(await code(createGrant(b, B.campaignId, { kind: 'creator', creator_id: A.creatorId, recipient_name: 'x' }))).toBe('VALIDATION')
  })

  it('the same creator email can exist in both organizations', async () => {
    const rows = (await pool.query(`select organization_id from cm_creators where lower(email) = 'same.person@example.test'`)).rows
    expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([A.org.id, B.org.id]))
  })

  it('a person in two organizations sees only the active one', async () => {
    const both = await addMembership(pool, await makeUser(pool, 'staff', 'consultant', A.org), B.org, 'admin')
    const memberships = await loadMemberships(pool, both.userId)
    expect(memberships.map((m) => m.orgId).sort()).toEqual([A.org.id, B.org.id].sort())
    const inB = actorFor({ id: both.userId, email: both.email, full_name: both.name }, memberships, B.org.id)!
    expect(inB.role).toBe('admin')
    expect((await listCampaigns(w.ctx(inB), {})).rows.map((r) => r.id)).toEqual([B.campaignId])
    const inA = actorFor({ id: both.userId, email: both.email, full_name: both.name }, memberships, A.org.id)!
    expect(inA.role).toBe('staff')
    expect((await listCampaigns(w.ctx(inA), {})).rows).toEqual([]) // staff, not a member of A's campaign
    // an org id the person does not belong to falls back to a real membership
    expect(actorFor({ id: both.userId, email: both.email, full_name: both.name }, memberships, '00000000-0000-4000-8000-000000000000')!.orgId)
      .toBe(memberships[0].orgId)
  })

  it('Hub briefs and Hub clients are available only to the Hub-linked organization', async () => {
    expect(await searchBriefs(w.ctx(B.manager), '')).toEqual([])
    expect(await searchHubClients(w.ctx(B.manager), '')).toEqual([])
    const brief = await makeBrief(pool, 'client-alpha')
    expect(await code(createCampaign(w.ctx(B.manager), { client_id: B.clientId, name: 'b', brief_document_link_id: brief }))).toBe('VALIDATION')
    expect(await code(createCampaign(w.ctx(A.manager), { client_id: A.clientId, name: 'a', brief_document_link_id: brief }))).toBe('OK')
  })
})

describe('organization isolation (database)', () => {
  it('composite foreign keys refuse cross-organization links even without the service layer', async () => {
    await expect(pool.query(`insert into cm_participations (organization_id, campaign_id, creator_id, currency) values ($1,$2,$3,'ILS')`,
      [B.org.id, B.campaignId, A.creatorId])).rejects.toThrow(/cm_participations_creator_fk/)
    await expect(pool.query(`insert into cm_participations (organization_id, campaign_id, creator_id, currency) values ($1,$2,$3,'ILS')`,
      [A.org.id, B.campaignId, A.creatorId])).rejects.toThrow(/cm_participations_campaign_fk/)
    await expect(pool.query(`insert into cm_campaigns (organization_id, client_id, name, owner_user_id, created_by) values ($1,$2,'x',$3,$3)`,
      [B.org.id, A.clientId, B.manager.userId])).rejects.toThrow(/cm_campaigns_client_fk/)
    await expect(pool.query(`insert into cm_portal_grants (organization_id, kind, creator_id, recipient_name, expires_at) values ($1,'creator',$2,'x',now())`,
      [B.org.id, A.creatorId])).rejects.toThrow(/cm_grants_creator_fk/)
  })
})

describe('portal invitations across campaigns and organizations', () => {
  it('a client invited to all their campaigns sees each one, and nothing of other clients or organizations', async () => {
    const m = A.manager
    const { id: second } = await createCampaign(w.ctx(m, now), { client_id: A.clientId, name: 'alpha second' })
    const otherClient = await makeClient(pool, 'alpha other client', A.org)
    const { id: other } = await createCampaign(w.ctx(m, now), { client_id: otherClient, name: 'alpha other' })
    const g = await createOrgGrant(w.ctx(m, now), { kind: 'client', client_id: A.clientId, recipient_name: 'rep' })
    const client = await portalFromInvite(pool, g.inviteUrl, now)
    expect(client.campaignId).toBeNull()
    const home = await portalHome(w.ctx(client)) as { campaigns: { id: string }[] }
    const ofClient = (await pool.query(`select id from cm_campaigns where client_id = $1`, [A.clientId])).rows.map((r) => r.id)
    expect(ofClient).toEqual(expect.arrayContaining([A.campaignId, second]))
    expect(home.campaigns.map((c) => c.id).sort()).toEqual(ofClient.sort())
    expect(await code(portalHome(w.ctx(client), other))).toBe('NOT_FOUND')
    expect(await code(portalHome(w.ctx(client), B.campaignId))).toBe('NOT_FOUND')
  })

  it('a talent agency invited to all campaigns sees its creators in every campaign, only those', async () => {
    const m = A.manager
    const agency = await createTalentAgency(w.ctx(m), { name: 'Stars' })
    const agent = await createAgent(w.ctx(m), { display_name: 'Roni', talent_agency_id: agency.id })
    const c1 = await createCreator(w.ctx(m), { display_name: 'star one', talent_agency_id: agency.id })
    const c2 = await createCreator(w.ctx(m), { display_name: 'star two', talent_agency_id: agency.id })
    await setAgentCreator(w.ctx(m), agent.id, c1.id, true)
    const { id: k1 } = await createCampaign(w.ctx(m, now), { client_id: A.clientId, name: 'k1' })
    const { id: k2 } = await createCampaign(w.ctx(m, now), { client_id: A.clientId, name: 'k2' })
    const p = [...(await addCreatorsToCampaign(w.ctx(m, now), k1, { creator_ids: [c1.id, c2.id, A.creatorId] })).added,
      ...(await addCreatorsToCampaign(w.ctx(m, now), k2, { creator_ids: [c1.id] })).added]
    await pool.query(`update cm_participations set selection_status = 'approved', participation_status = 'invited' where id = any($1)`, [p])
    const ag = await createOrgGrant(w.ctx(m, now), { kind: 'agency', talent_agency_id: agency.id, recipient_name: 'Stars admin' })
    const agencyActor = await portalFromInvite(pool, ag.inviteUrl, now)
    const all = await portalParticipations(w.ctx(agencyActor))
    expect(all.participations.map((x: Record<string, unknown>) => `${x.campaign_name}/${x.creator_name}`).sort())
      .toEqual(['k1/star one', 'k1/star two', 'k2/star one'])
    expect(all.campaigns.map((c) => c.id).sort()).toEqual([k1, k2].sort())
    // one campaign at a time
    expect((await portalParticipations(w.ctx(agencyActor), k2)).participations).toHaveLength(1)
    // the agency can accept on behalf of its creator
    const tv = (await pool.query(`select id, terms_version from cm_participations where campaign_id = $1 and creator_id = $2`, [k2, c1.id])).rows[0]
    await respondToInvitation(w.ctx(agencyActor), tv.id, { response: 'accepted', terms_version: tv.terms_version })
    // the agent (lower level) sees only the assigned creator
    const gg = await createOrgGrant(w.ctx(m, now), { kind: 'agent', agent_id: agent.id, recipient_name: 'Roni' })
    const agentActor = await portalFromInvite(pool, gg.inviteUrl, now)
    expect((await portalParticipations(w.ctx(agentActor))).participations.map((x: Record<string, unknown>) => x.creator_name))
      .toEqual(['star one', 'star one'])
  })

  it('suspending an organization cuts its portal sessions and links', async () => {
    const g = await createOrgGrant(w.ctx(B.manager, now), { kind: 'client', client_id: B.clientId, recipient_name: 'b rep' })
    const second = await createOrgGrant(w.ctx(B.manager, now), { kind: 'client', client_id: B.clientId, recipient_name: 'b rep 2' })
    const { sessionSecret } = await redeemToken(pool, tokenFromInvite(g.inviteUrl), now)
    expect(await resolvePortalSession(pool, sessionSecret, now)).not.toBeNull()
    await pool.query(`update cm_organizations set status = 'suspended' where id = $1`, [B.org.id])
    expect(await resolvePortalSession(pool, sessionSecret, now)).toBeNull()
    expect(await code(redeemToken(pool, tokenFromInvite(second.inviteUrl), now))).toBe('UNAUTHENTICATED')
    await pool.query(`update cm_organizations set status = 'active' where id = $1`, [B.org.id])
  })
})

describe('staff accounts and sign-in', () => {
  it('invite → single-use link → active membership; disabling ends access', async () => {
    const admin = await makeUser(pool, 'admin', 'org-admin', A.org)
    const inv = await inviteMember(w.ctx(admin, now), { email: 'new.person@example.test', full_name: 'New Person', role: 'staff' })
    const members = await listMembers(w.ctx(admin))
    expect(members.find((x) => x.account_id === inv.accountId)?.status).toBe('invited')
    expect(await loadMemberships(pool, inv.accountId)).toEqual([])
    const s = await redeemLoginToken(pool, tokenFromInvite(inv.inviteUrl), now)
    expect(await code(redeemLoginToken(pool, tokenFromInvite(inv.inviteUrl), now))).toBe('UNAUTHENTICATED')
    expect((await loadMemberships(pool, inv.accountId)).map((m) => m.orgId)).toEqual([A.org.id])
    expect((await resolveAccountSession(pool, s.sessionSecret, now))?.id).toBe(inv.accountId)
    await updateMember(w.ctx(admin, now), inv.accountId, { status: 'disabled' })
    expect(await loadMemberships(pool, inv.accountId)).toEqual([])
    expect(await resolveAccountSession(pool, s.sessionSecret, now)).toBeNull()
    // only org admins manage members; nobody changes their own role
    expect(await code(listMembers(w.ctx(A.manager)))).toBe('FORBIDDEN')
    expect(await code(updateMember(w.ctx(admin), admin.userId, { role: 'staff' }))).toBe('VALIDATION')
  })

  it('a login link request is silent for unknown addresses and queues a link for members', async () => {
    const before = (await pool.query(`select count(*)::int as n from cm_notifications where login_link_purpose = 'login'`)).rows[0].n
    await requestStaffLoginLink(pool, 'nobody@example.test', now, 'ip-1')
    await requestStaffLoginLink(pool, A.manager.email, now, 'ip-1')
    const rows = (await pool.query(`select to_address, body_text from cm_notifications where login_link_purpose = 'login' order by created_at desc`)).rows
    expect(rows.length - before).toBe(1)
    expect(rows[0].to_address).toBe(A.manager.email)
    expect(rows[0].body_text).not.toMatch(/#t=/) // the token is minted at send time, never stored
  })

  it('an expired sign-in link does not work', async () => {
    const admin = await makeUser(pool, 'admin', 'admin2', A.org)
    const inv = await inviteMember(w.ctx(admin, now), { email: 'late.person@example.test', full_name: 'Late', role: 'staff' })
    expect(await code(redeemLoginToken(pool, tokenFromInvite(inv.inviteUrl), new Date(now.getTime() + 8 * 86_400_000)))).toBe('UNAUTHENTICATED')
  })

  it('creating an organization requires a platform admin (or self sign-up) and invites its first admin', async () => {
    const someone = await makeUser(pool, 'admin', 'not-platform', A.org)
    expect(await code(createOrganization(pool, { input: { name: 'Gamma', admin_email: 'g@example.test', admin_name: 'G' }, byAccount: { id: someone.userId, email: someone.email }, signup: false, now, baseUrl: 'http://t' }))).toBe('FORBIDDEN')
    const r = await createOrganization(pool, { input: { name: 'Gamma Agency', admin_email: 'g@example.test', admin_name: 'G' }, byAccount: null, signup: true, now, baseUrl: 'http://t' })
    const s = await redeemLoginToken(pool, tokenFromInvite(r.inviteUrl), now)
    const ms = await loadMemberships(pool, s.accountId)
    expect(ms).toEqual([{ orgId: r.orgId, orgName: 'Gamma Agency', orgSlug: expect.stringMatching(/^gamma-agency/), role: 'admin' }])
    // the new organization starts empty
    const gamma = actorFor({ id: s.accountId, email: 'g@example.test', full_name: 'G' }, ms, r.orgId)!
    expect((await listCampaigns(w.ctx(gamma), {})).rows).toEqual([])
    expect(await listTalentAgencies(w.ctx(gamma))).toEqual([])
    expect(await code(createClient(w.ctx(gamma), { name: 'client-alpha' }))).toBe('OK') // same name as A's client is fine in another org
  })
})

describe('end-to-end inside a second organization', () => {
  it('B runs the client approval flow without touching A', async () => {
    const b = B.manager
    await changeCampaignStatus(w.ctx(b), B.campaignId, { to: 'planning', expected_version: (await pool.query(`select version from cm_campaigns where id = $1`, [B.campaignId])).rows[0].version })
    const sl = await createShortlist(w.ctx(b, now), B.campaignId, { participation_ids: [B.pid] })
    const item = (await pool.query(`select id from cm_shortlist_items where shortlist_id = $1`, [sl.id])).rows[0].id
    await internalShortlistDecision(w.ctx(b, now), sl.id, item, { decision: 'approved', shortlist_version: 1 })
    const g = await createGrant(w.ctx(b, now), B.campaignId, { kind: 'client', recipient_name: 'b client' })
    const client = await portalFromInvite(pool, g.inviteUrl, now)
    await sendShortlistToClient(w.ctx(b, now), sl.id)
    await clientShortlistDecision(w.ctx(client, now), item, { decision: 'approved', shortlist_version: 1 })
    const pv = (await pool.query(`select version from cm_participations where id = $1`, [B.pid])).rows[0].version
    const inv = await participationAction(w.ctx(b, now), B.pid, { action: 'invite', expected_version: pv, recipient_name: 'creator' })
    const creator = await portalFromInvite(pool, inv.invite_url!, now)
    expect(creator.orgId).toBe(B.org.id)
    const tv = (await pool.query(`select terms_version from cm_participations where id = $1`, [B.pid])).rows[0].terms_version
    await respondToInvitation(w.ctx(creator, now), B.pid, { response: 'accepted', terms_version: tv })
    // the B creator cannot reach A's deliverable or upload into A
    expect(await code(getDeliverable(w.ctx(creator), A.did))).toBe('NOT_FOUND')
    expect(await code(submitVersion(w.ctx(creator), A.did, { external_url: 'https://x.example/a' }))).toBe('NOT_FOUND')
    expect(await code(createUploadIntent(w.ctx(creator), { participation_id: A.pid, purpose: 'content', filename: 'x.png', mime_type: 'image/png', size: 10 }))).toBe('NOT_FOUND')
    // audit rows carry the right organization
    const orgs = (await pool.query(`select distinct organization_id from cm_audit_events where campaign_id = $1`, [B.campaignId])).rows
    expect(orgs).toEqual([{ organization_id: B.org.id }])
  })
})

describe('creator import (CSV)', () => {
  it('previews, flags duplicates and errors, then creates only the ready rows', async () => {
    const { previewImport, commitImport, parseCsv } = await import('../services/import')
    expect(parseCsv('﻿שם;טלפון\r\n"כהן, דנה";050-1234567\r\n')).toEqual([['שם', 'טלפון'], ['כהן, דנה', '050-1234567']])
    const csv = [
      'שם,דוא"ל,טלפון,אינסטגרם,עוקבים,קטגוריות,סוכנות',
      'נועה ספורט,noa.sport@example.test,0521112233,@noa.sport,"12,000",ספורט|ריצה,Import Agency',
      'כפילות בקובץ,noa.sport@example.test,,,,,',
      `קיימת במאגר,same.person@example.test,,,,,`,
      ',missing.name@example.test,,,,,',
      'טלפון שגוי,,12,,,,',
    ].join('\n')
    const ctx = w.ctx(A.manager, now)
    const pre = await previewImport(ctx, { csv })
    expect(pre.summary).toEqual({ total: 5, ready: 1, duplicate: 2, error: 2 })
    expect(pre.missingAgencies).toEqual(['Import Agency'])
    expect(await code(commitImport(ctx, { csv }))).toBe('PRECONDITION_FAILED')
    const res = await commitImport(ctx, { csv, create_missing_agencies: true })
    expect(res.created).toBe(1)
    expect(res.createdAgencies).toBe(1)
    const c = (await pool.query(`select c.phone, c.categories, ta.name as agency, s.handle, s.follower_count from cm_creators c
      join cm_talent_agencies ta on ta.id = c.talent_agency_id join cm_creator_social_accounts s on s.creator_id = c.id
      where c.organization_id = $1 and c.display_name = 'נועה ספורט'`, [A.org.id])).rows[0]
    expect(c).toEqual({ phone: '+972521112233', categories: ['ספורט', 'ריצה'], agency: 'Import Agency', handle: 'noa.sport', follower_count: 12000 })
    // importing the same file again creates nothing
    expect((await commitImport(ctx, { csv, create_missing_agencies: true })).created).toBe(0)
    // the import never touched organization B
    expect((await pool.query(`select count(*)::int as n from cm_creators where organization_id = $1`, [B.org.id])).rows[0].n).toBe(1)
  })
})
