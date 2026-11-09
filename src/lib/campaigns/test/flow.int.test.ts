/**
 * End-to-end business flow and core rules (required tests 1, 2, 3, 8, 9, 10, 11, 12, 26).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { FakeTransport, PNG_1PX, makeBrief, makeClient, makeUser, makeWorld, portalFromInvite, testPool, type World } from './helpers'
import type { InternalActor, PortalActor } from '../context'
import { createCampaign, changeCampaignStatus, getCampaign, closeCheck } from '../services/campaigns'
import { createCreator } from '../services/creators'
import { addCreatorsToCampaign, participationAction, respondToInvitation, updateParticipationTerms } from '../services/participations'
import { clientShortlistDecision, createShortlist, internalShortlistDecision, sendShortlistToClient } from '../services/shortlists'
import {
  addMetrics, clientContentDecision, createDeliverable, getDeliverable, internalContentDecision, reportPublication, submitVersion, verifyPublication,
} from '../services/deliverables'
import { completeUpload, createUploadIntent } from '../services/assets'
import { createGrant } from '../services/grants'
import { getInternalReport, reportToCsv } from '../services/reporting'
import { getBudget } from '../services/budget'
import { runWorker } from '../jobs/worker'
import { DomainError } from '../errors'

let pool: Pool
let w: World
let manager: InternalActor
let clientId: string

const at = (iso: string) => new Date(iso)

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(DomainError)
  await p.catch((e: DomainError) => expect(e.code).toBe(code))
}

async function upload(actorCtx: ReturnType<World['ctx']>, participationId: string, purpose: 'content' | 'evidence' | 'metric_evidence' = 'content') {
  const intent = await createUploadIntent(actorCtx, { participation_id: participationId, purpose, filename: 'shot.png', mime_type: 'image/png', size: PNG_1PX.length })
  const key = (await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])).rows[0].storage_key
  await w.storage.write(key, PNG_1PX, 'image/png') // what the browser PUT does
  const done = await completeUpload(actorCtx, intent.asset_id)
  expect(done.status).toBe('ready')
  return intent.asset_id
}

beforeAll(async () => {
  pool = testPool()
  w = makeWorld(pool)
  manager = await makeUser(pool, 'manager', 'נועה מנהלת')
  clientId = await makeClient(pool, 'Adidas IL')
})
afterAll(async () => { await pool.end() })

describe('campaign setup', () => {
  it('opens a campaign linked to a brief (test 1)', async () => {
    const brief = await makeBrief(pool, 'Adidas IL')
    const { id } = await createCampaign(w.ctx(manager), {
      client_id: clientId, name: 'Adidas Run 2026', brief_document_link_id: brief, start_date: '2026-11-01', end_date: '2026-12-31',
      approved_budget: '100000', currency: 'ILS',
    })
    const c = await getCampaign(w.ctx(manager), id)
    expect(c.status).toBe('draft')
    expect(c.brief_document_link_id).toBe(brief)
    expect(c.brief_label).toContain('Adidas IL')
    expect(c.approved_budget).toBe('100000.00')
  })

  it('rejects an unknown brief and an end date before the start', async () => {
    await expectCode(createCampaign(w.ctx(manager), { client_id: clientId, name: 'x', brief_document_link_id: '00000000-0000-4000-8000-000000000000' }), 'VALIDATION')
    await expectCode(createCampaign(w.ctx(manager), { client_id: clientId, name: 'x', start_date: '2026-12-01', end_date: '2026-11-01' }), 'VALIDATION')
  })

  it('staff cannot open campaigns', async () => {
    const staff = await makeUser(pool, 'staff')
    await expectCode(createCampaign(w.ctx(staff), { client_id: clientId, name: 'nope' }), 'FORBIDDEN')
  })
})

describe('creators in campaigns', () => {
  it('adding the same creator twice does not duplicate (test 2) and duplicate creators are refused', async () => {
    const { id: campaignId } = await createCampaign(w.ctx(manager), { client_id: clientId, name: 'dup test' })
    const { id: creatorId } = await createCreator(w.ctx(manager), {
      display_name: 'דנה ריצה', email: 'dana.run@example.test', phone: '050-1234567',
      social_accounts: [{ platform: 'instagram', handle: '@dana.run' }],
    })
    const first = await addCreatorsToCampaign(w.ctx(manager), campaignId, { creator_ids: [creatorId] })
    const second = await addCreatorsToCampaign(w.ctx(manager), campaignId, { creator_ids: [creatorId, creatorId] })
    expect(first.added).toHaveLength(1)
    expect(second.added).toHaveLength(0)
    expect(second.duplicates).toEqual([creatorId])
    const n = await pool.query(`select count(*)::int as n from cm_participations where campaign_id = $1`, [campaignId])
    expect(n.rows[0].n).toBe(1)
    // the pool itself refuses a duplicate by phone (normalized) or handle
    await expectCode(createCreator(w.ctx(manager), { display_name: 'דנה 2', phone: '+972501234567' }), 'CONFLICT')
    await expectCode(createCreator(w.ctx(manager), { display_name: 'דנה 3', social_accounts: [{ platform: 'instagram', handle: 'DANA.RUN' }] }), 'CONFLICT')
  })

  it('the same creator can be in two campaigns with different fees and deliverables (test 3)', async () => {
    const a = await createCampaign(w.ctx(manager), { client_id: clientId, name: 'camp A' })
    const b = await createCampaign(w.ctx(manager), { client_id: clientId, name: 'camp B' })
    const { id: creatorId } = await createCreator(w.ctx(manager), { display_name: 'אורי', email: 'ori@example.test' })
    const [pa] = (await addCreatorsToCampaign(w.ctx(manager), a.id, { creator_ids: [creatorId] })).added
    const [pb] = (await addCreatorsToCampaign(w.ctx(manager), b.id, { creator_ids: [creatorId] })).added
    await updateParticipationTerms(w.ctx(manager), pa, { expected_version: 1, agreed_fee: '5000' })
    await updateParticipationTerms(w.ctx(manager), pb, { expected_version: 1, agreed_fee: '12000.50' })
    await createDeliverable(w.ctx(manager), pa, { title: 'ריל', type: 'reel', platform: 'instagram' })
    await createDeliverable(w.ctx(manager), pb, { title: 'סטורי 1', type: 'story', platform: 'instagram' })
    await createDeliverable(w.ctx(manager), pb, { title: 'סטורי 2', type: 'story', platform: 'instagram' })
    const rows = (await pool.query(`select p.campaign_id, p.agreed_fee::text, (select count(*)::int from cm_deliverables d where d.participation_id = p.id) as n
      from cm_participations p where p.creator_id = $1 order by p.agreed_fee`, [creatorId])).rows
    expect(rows).toEqual([{ campaign_id: a.id, agreed_fee: '5000.00', n: 1 }, { campaign_id: b.id, agreed_fee: '12000.50', n: 2 }])
  })
})

describe('full pilot flow (test 26) with versioning and approval rules (8, 9, 10, 11, 12)', () => {
  let campaignId: string
  let p1: string, p2: string
  let creatorActor: PortalActor
  let clientActor: PortalActor
  let deliverableId: string
  const t0 = at('2026-11-01T08:00:00Z')

  it('brief → campaign → candidates → internal + client approval on a frozen list version (test 8)', async () => {
    const brief = await makeBrief(pool, 'Adidas IL')
    campaignId = (await createCampaign(w.ctx(manager, t0), {
      client_id: clientId, name: 'Adidas Ultraboost', brief_document_link_id: brief, start_date: '2026-11-01', end_date: '2026-11-30', approved_budget: '50000',
    })).id
    await changeCampaignStatus(w.ctx(manager, t0), campaignId, { to: 'planning', expected_version: 1 })
    await changeCampaignStatus(w.ctx(manager, t0), campaignId, { to: 'recruiting', expected_version: 2 })
    const c1 = await createCreator(w.ctx(manager), { display_name: 'יעל', email: 'yael@example.test', social_accounts: [{ platform: 'instagram', handle: 'yael.fit', follower_count: 52000 }] })
    const c2 = await createCreator(w.ctx(manager), { display_name: 'עומר', email: 'omer@example.test' })
    ;[p1, p2] = (await addCreatorsToCampaign(w.ctx(manager, t0), campaignId, { creator_ids: [c1.id, c2.id] })).added
    await updateParticipationTerms(w.ctx(manager, t0), p1, { expected_version: 1, agreed_fee: '8000', deliverables_summary: 'ריל + 3 סטוריז', client_visible_notes: 'קהל ספורט' })

    const sl = await createShortlist(w.ctx(manager, t0), campaignId, { participation_ids: [p1, p2] })
    const items = (await pool.query(`select id, participation_id, client_snapshot from cm_shortlist_items where shortlist_id = $1`, [sl.id])).rows
    const item1 = items.find((i) => i.participation_id === p1)
    const item2 = items.find((i) => i.participation_id === p2)
    // the client snapshot never carries money or internal notes (test 7, snapshot side)
    expect(JSON.stringify(item1.client_snapshot)).not.toMatch(/8000|fee|internal/)
    await internalShortlistDecision(w.ctx(manager, t0), sl.id, item1.id, { decision: 'approved', shortlist_version: 1 })
    await expectCode(internalShortlistDecision(w.ctx(manager, t0), sl.id, item2.id, { decision: 'rejected', shortlist_version: 1 }), 'VALIDATION') // needs a comment (11)
    await internalShortlistDecision(w.ctx(manager, t0), sl.id, item2.id, { decision: 'rejected', feedback: 'לא מתאים לקהל', shortlist_version: 1 })
    // double click is harmless, a different decision is a conflict (12)
    expect(await internalShortlistDecision(w.ctx(manager, t0), sl.id, item1.id, { decision: 'approved', shortlist_version: 1 })).toEqual({ idempotent: true })

    const grant = await createGrant(w.ctx(manager, t0), campaignId, { kind: 'client', recipient_name: 'נציגת אדידס', recipient_email: 'rep@adidas.example' })
    clientActor = await portalFromInvite(pool, grant.inviteUrl, t0)
    await sendShortlistToClient(w.ctx(manager, t0), sl.id)

    // a candidate added after the list was sent is NOT covered by the client's decision
    const c3 = await createCreator(w.ctx(manager), { display_name: 'מאוחר', email: 'late@example.test' })
    const [p3] = (await addCreatorsToCampaign(w.ctx(manager, t0), campaignId, { creator_ids: [c3.id] })).added
    // client acting on a stale version number gets a clear conflict
    await expectCode(clientShortlistDecision(w.ctx(clientActor, t0), item1.id, { decision: 'approved', shortlist_version: 2 }), 'STALE_TARGET')
    await clientShortlistDecision(w.ctx(clientActor, t0), item1.id, { decision: 'approved', shortlist_version: 1 })
    expect(await clientShortlistDecision(w.ctx(clientActor, t0), item1.id, { decision: 'approved', shortlist_version: 1 })).toEqual({ idempotent: true })
    // the internally rejected item was never shown to the client
    await expectCode(clientShortlistDecision(w.ctx(clientActor, t0), item2.id, { decision: 'approved', shortlist_version: 1 }), 'NOT_FOUND')

    const sel = (await pool.query(`select id, selection_status from cm_participations where id = any($1)`, [[p1, p2, p3]])).rows
    expect(Object.fromEntries(sel.map((r) => [r.id, r.selection_status]))).toEqual({ [p1]: 'approved', [p2]: 'rejected', [p3]: 'proposed' })
    const decisions = (await pool.query(`select approval_stage, decision, target_version from cm_approval_decisions where target_id = $1 order by decided_at`, [item1.id])).rows
    expect(decisions).toEqual([
      { approval_stage: 'internal', decision: 'approved', target_version: 1 },
      { approval_stage: 'client', decision: 'approved', target_version: 1 },
    ])
    // automation 1: approved creator → invitation task for the manager
    const t = (await pool.query(`select type, status from cm_tasks where participation_id = $1 and type = 'invite_creator'`, [p1])).rows
    expect(t).toEqual([{ type: 'invite_creator', status: 'open' }])
  })

  it('creator invitation and acceptance are separate from client approval', async () => {
    deliverableId = (await createDeliverable(w.ctx(manager, t0), p1, {
      title: 'ריל השקה', type: 'reel', platform: 'instagram',
      submission_due_at: '2026-11-10T12:00', publication_due_at: '2026-11-15T19:00', required_tags: ['#adidas'],
    })).id
    const pv = (await pool.query(`select version from cm_participations where id = $1`, [p1])).rows[0].version
    const inv = await participationAction(w.ctx(manager, t0), p1, { action: 'invite', expected_version: pv, recipient_name: 'יעל', recipient_email: 'yael@example.test' })
    expect(inv.invite_url).toMatch(/\/portal\/enter#t=/)
    creatorActor = await portalFromInvite(pool, inv.invite_url!, t0)
    expect(creatorActor.grantKind).toBe('creator')
    const terms = (await pool.query(`select terms_version from cm_participations where id = $1`, [p1])).rows[0].terms_version
    await respondToInvitation(w.ctx(creatorActor, t0), p1, { response: 'accepted', terms_version: terms })
    const p = (await pool.query(`select participation_status, selection_status, accepted_terms_version from cm_participations where id = $1`, [p1])).rows[0]
    expect(p).toEqual({ participation_status: 'accepted', selection_status: 'approved', accepted_terms_version: terms })
    // automation 2: deliverable task for the creator + reminder and overdue jobs scheduled
    const jobs = (await pool.query(`select kind, status from cm_jobs where subject_id = $1 order by kind`, [deliverableId])).rows
    expect(jobs).toEqual([{ kind: 'deliverable.submission_overdue', status: 'pending' }, { kind: 'deliverable.submission_reminder', status: 'pending' }])
    // fee is now a commitment
    const b = await getBudget(w.ctx(manager), campaignId)
    expect(b.summary.committed).toBe(BigInt(800000))
  })

  it('submission, changes requested, new version, approvals bound to the current version (9, 10, 11, 12)', async () => {
    const t1 = at('2026-11-08T10:00:00Z')
    const v1asset = await upload(w.ctx(creatorActor, t1), p1)
    const v1 = await submitVersion(w.ctx(creatorActor, t1), deliverableId, { asset_id: v1asset, caption: 'גרסה ראשונה #adidas' })
    expect(v1.version_number).toBe(1)
    // client cannot see v1 yet (not internally approved)
    await expectCode(getDeliverable(w.ctx(clientActor, t1), deliverableId), 'NOT_FOUND')
    // client approval is not available before internal approval
    await expectCode(clientContentDecision(w.ctx(clientActor, t1), deliverableId, { version_id: v1.version_id, decision: 'approved' }), 'NOT_FOUND')
    // changes requested without a comment is refused (11)
    await expectCode(internalContentDecision(w.ctx(manager, t1), deliverableId, { version_id: v1.version_id, decision: 'changes_requested' }), 'VALIDATION')
    await internalContentDecision(w.ctx(manager, t1), deliverableId, { version_id: v1.version_id, decision: 'changes_requested', feedback: 'להוסיף את הלוגו' })
    const reviseTask = (await pool.query(`select audience, status from cm_tasks where deliverable_id = $1 and type = 'revise_content'`, [deliverableId])).rows
    expect(reviseTask).toEqual([{ audience: 'creator', status: 'open' }])

    const t2 = at('2026-11-09T10:00:00Z')
    const v2asset = await upload(w.ctx(creatorActor, t2), p1)
    const v2 = await submitVersion(w.ctx(creatorActor, t2), deliverableId, { asset_id: v2asset, caption: 'גרסה 2 #adidas', based_on_version_id: v1.version_id })
    expect(v2.version_number).toBe(2)
    // a decision on the superseded version is refused (9)
    await expectCode(internalContentDecision(w.ctx(manager, t2), deliverableId, { version_id: v1.version_id, decision: 'approved' }), 'STALE_TARGET')
    await internalContentDecision(w.ctx(manager, t2), deliverableId, { version_id: v2.version_id, decision: 'approved' })
    // double click on internal approve (12)
    expect(await internalContentDecision(w.ctx(manager, t2), deliverableId, { version_id: v2.version_id, decision: 'approved' })).toEqual({ idempotent: true })

    // the client sees only internally approved versions, and no internal-only data
    const view = await getDeliverable(w.ctx(clientActor, t2), deliverableId)
    expect(view.versions.map((v: { id: string }) => v.id)).toEqual([v2.version_id])
    expect(view.deliverable).not.toHaveProperty('assigned_reviewer_id')

    // creator submits v3 while the client is reviewing v2 → the client's v2 approval must fail (10)
    const t3 = at('2026-11-09T12:00:00Z')
    const v3asset = await upload(w.ctx(creatorActor, t3), p1)
    const v3 = await submitVersion(w.ctx(creatorActor, t3), deliverableId, { asset_id: v3asset, caption: 'גרסה 3', based_on_version_id: v2.version_id })
    await expectCode(clientContentDecision(w.ctx(clientActor, t3), deliverableId, { version_id: v2.version_id, decision: 'approved' }), 'STALE_TARGET')
    // history kept: three versions, v2's internal approval still recorded
    const hist = (await pool.query(`select v.version_number, (select count(*)::int from cm_approval_decisions a where a.target_id = v.id) as decisions
      from cm_content_versions v where v.deliverable_id = $1 order by v.version_number`, [deliverableId])).rows
    expect(hist).toEqual([{ version_number: 1, decisions: 1 }, { version_number: 2, decisions: 1 }, { version_number: 3, decisions: 0 }])
    // v3 needs internal approval again before the client can decide
    await expectCode(clientContentDecision(w.ctx(clientActor, t3), deliverableId, { version_id: v3.version_id, decision: 'approved' }), 'PRECONDITION_FAILED')
    await internalContentDecision(w.ctx(manager, t3), deliverableId, { version_id: v3.version_id, decision: 'approved' })
    await clientContentDecision(w.ctx(clientActor, t3), deliverableId, { version_id: v3.version_id, decision: 'approved' })
    expect(await clientContentDecision(w.ctx(clientActor, t3), deliverableId, { version_id: v3.version_id, decision: 'approved' })).toEqual({ idempotent: true })
    const d = (await pool.query(`select status, current_version_id from cm_deliverables where id = $1`, [deliverableId])).rows[0]
    expect(d).toEqual({ status: 'approved', current_version_id: v3.version_id })
  })

  it('publication report → verification needs evidence → metrics → report', async () => {
    const t4 = at('2026-11-15T17:30:00Z')
    await reportPublication(w.ctx(creatorActor, t4), deliverableId, { published_url: 'https://instagram.com/p/abc', reported_published_at: '2026-11-15T19:20' })
    const pub = (await pool.query(`select version from cm_publications where deliverable_id = $1`, [deliverableId])).rows[0]
    await expectCode(verifyPublication(w.ctx(manager, t4), deliverableId, { decision: 'verified', actual_published_at: '2026-11-15T19:20', expected_publication_version: pub.version }), 'VALIDATION')
    const evidence = await upload(w.ctx(manager, t4), p1, 'evidence')
    await verifyPublication(w.ctx(manager, t4), deliverableId, { decision: 'verified', actual_published_at: '2026-11-15T18:55', evidence_asset_id: evidence, expected_publication_version: pub.version })
    await addMetrics(w.ctx(creatorActor, t4), deliverableId, { captured_at: '2026-11-15T19:25', values: { views: 15000, likes: 0, reach: '' } })

    const report = await getInternalReport(w.ctx(manager, at('2026-11-20T00:00:00Z')), campaignId)
    const row = report.rows.find((r) => r.deliverableId === deliverableId)!
    expect(row.status).toBe('publication_verified')
    expect(row.metrics).toEqual({ views: 15000, likes: 0 }) // reach left empty = missing, not 0
    expect(row.submittedLate).toBe(false)
    expect(report.metrics.submission).toMatchObject({ due: 1, onTime: 1, rate: 1 })
    expect(report.metrics.publication).toMatchObject({ due: 1, verifiedOnTime: 1, rate: 1 })
    expect(report.metrics.coverage).toEqual({ published: 1, withMetrics: 1, rate: 1 })
    expect(report.budget?.committed).toBe('₪8,000.00')
    const csv = reportToCsv(report)
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('ריל השקה')
    const checks = await closeCheck(w.ctx(manager), campaignId)
    expect(checks).toEqual([])
  })

  it('messages go out through the worker to the fake transport only, and stale ones are cancelled', async () => {
    const transport = w.transport as FakeTransport
    await createGrant(w.ctx(manager), campaignId, { kind: 'client', recipient_name: 'מנהל שיווק', recipient_email: 'cmo@adidas.example', send_email: true })
    const r = await runWorker(pool, w.ctx(manager).deps, at('2026-11-16T00:00:00Z'))
    expect(r.notifications.sent).toBeGreaterThan(0)
    // e.g. "content waiting for your approval" — no longer true, so not sent
    expect(r.notifications.cancelled).toBeGreaterThan(0)
    const cancelled = (await pool.query(`select subject from cm_notifications where campaign_id = $1 and status = 'cancelled'`, [campaignId])).rows
    expect(cancelled.some((c) => c.subject.includes('ממתין לאישורך'))).toBe(true)
    expect(transport.sent.every((m) => m.to.endsWith('.test') || m.to.endsWith('.example'))).toBe(true)
    // portal recipients get a fresh single-use login link
    const toCmo = transport.sent.find((m) => m.to === 'cmo@adidas.example')
    expect(toCmo?.text).toMatch(/\/portal\/enter#t=[A-Za-z0-9_-]{40,}/)
    // the stored notification never contains a token
    const stored = (await pool.query(`select body_text, link_path from cm_notifications where campaign_id = $1`, [campaignId])).rows
    expect(stored.every((x) => !/#t=/.test(x.body_text + (x.link_path ?? '')))).toBe(true)
    // running the worker again sends nothing twice
    const before = transport.sent.length
    await runWorker(pool, w.ctx(manager).deps, at('2026-11-16T01:00:00Z'))
    expect(transport.sent.length).toBe(before)
  })
})
