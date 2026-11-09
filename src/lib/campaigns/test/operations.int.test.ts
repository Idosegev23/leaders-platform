/**
 * Reminders, jobs, outbox, uploads, budget and closing
 * (required tests 13, 14, 15, 16, 17, 20, 23, 25; automations 3, 4, 9, 11, 12).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { PNG_1PX, makeClient, makeUser, makeWorld, portalFromInvite, testPool, type FakeTransport, type World } from './helpers'
import type { InternalActor, PortalActor } from '../context'
import { DomainError } from '../errors'
import { changeCampaignStatus, closeCheck, createCampaign } from '../services/campaigns'
import { createCreator } from '../services/creators'
import { addCreatorsToCampaign, participationAction, respondToInvitation, updateParticipationTerms } from '../services/participations'
import { clientShortlistDecision, createShortlist, internalShortlistDecision, sendShortlistToClient } from '../services/shortlists'
import { createDeliverable, submitVersion, updateDeliverable } from '../services/deliverables'
import { cleanupOrphanAssets, completeUpload, createUploadIntent } from '../services/assets'
import { createGrant } from '../services/grants'
import { addBudgetLine, getBudget, updateBudgetLine } from '../services/budget'
import { retryNotification } from '../services/overview'
import { getInternalReport } from '../services/reporting'
import { dispatchNotifications, runJobs, runWorker } from '../jobs/worker'

let pool: Pool
let w: World
let manager: InternalActor
let clientId: string
const T0 = new Date('2026-11-01T08:00:00Z')
const hours = (h: number, from = T0) => new Date(from.getTime() + h * 3_600_000)

async function code(p: Promise<unknown>): Promise<string> {
  try { await p; return 'OK' } catch (e) { if (e instanceof DomainError) return e.code; throw e }
}

/** Campaign with an accepted creator and a deliverable due in 72h. */
async function scenario(opts: { dueInHours?: number } = {}) {
  const { id: campaignId } = await createCampaign(w.ctx(manager, T0), { client_id: clientId, name: `ops ${Math.random()}`, approved_budget: '20000', start_date: '2026-11-01', end_date: '2026-11-30' })
  const cr = await createCreator(w.ctx(manager), { display_name: `c-${Math.random().toString(36).slice(2, 7)}`, email: `${Math.random().toString(36).slice(2)}@example.test` })
  const [pid] = (await addCreatorsToCampaign(w.ctx(manager, T0), campaignId, { creator_ids: [cr.id] })).added
  await updateParticipationTerms(w.ctx(manager, T0), pid, { expected_version: 1, agreed_fee: '6000' })
  const sl = await createShortlist(w.ctx(manager, T0), campaignId, { participation_ids: [pid] })
  const item = (await pool.query(`select id from cm_shortlist_items where shortlist_id = $1`, [sl.id])).rows[0].id
  await internalShortlistDecision(w.ctx(manager, T0), sl.id, item, { decision: 'approved', shortlist_version: 1 })
  const cg = await createGrant(w.ctx(manager, T0), campaignId, { kind: 'client', recipient_name: 'rep', recipient_email: 'rep@client.example' })
  const client = await portalFromInvite(pool, cg.inviteUrl, T0)
  await sendShortlistToClient(w.ctx(manager, T0), sl.id)
  await clientShortlistDecision(w.ctx(client, T0), item, { decision: 'approved', shortlist_version: 1 })
  const due = hours(opts.dueInHours ?? 72)
  const { id: did } = await createDeliverable(w.ctx(manager, T0), pid, { title: 'ריל', type: 'reel', platform: 'instagram', submission_due_at: due.toISOString(), publication_due_at: hours(24, due).toISOString() })
  const pv = (await pool.query(`select version from cm_participations where id = $1`, [pid])).rows[0].version
  const inv = await participationAction(w.ctx(manager, T0), pid, { action: 'invite', expected_version: pv, recipient_name: 'creator', recipient_email: 'creator@example.test' })
  const creator = await portalFromInvite(pool, inv.invite_url!, T0)
  const tv = (await pool.query(`select terms_version from cm_participations where id = $1`, [pid])).rows[0].terms_version
  await respondToInvitation(w.ctx(creator, T0), pid, { response: 'accepted', terms_version: tv })
  return { campaignId, pid, did, creator, client, due }
}

const jobsOf = async (did: string) =>
  (await pool.query(`select kind, status, result from cm_jobs where subject_id = $1 order by kind, created_at`, [did])).rows

async function uploadReady(creator: PortalActor, pid: string, now: Date) {
  const intent = await createUploadIntent(w.ctx(creator, now), { participation_id: pid, purpose: 'content', filename: 'a.png', mime_type: 'image/png', size: PNG_1PX.length })
  const key = (await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])).rows[0].storage_key
  await w.storage.write(key, PNG_1PX, 'image/png')
  await completeUpload(w.ctx(creator, now), intent.asset_id)
  return intent.asset_id
}

beforeAll(async () => {
  pool = testPool()
  w = makeWorld(pool)
  manager = await makeUser(pool, 'manager', 'ops-manager')
  clientId = await makeClient(pool, 'ops-client')
})
beforeEach(() => { (w.transport as FakeTransport).mode = 'ok' })
afterAll(async () => { await pool.end() })

describe('reminders', () => {
  it('reminder fires once before the deadline, overdue marks the breach and alerts the manager (automations 3, 4)', async () => {
    const s = await scenario({ dueInHours: 72 })
    // 48h later = 24h before due → reminder runs
    let r = await runJobs(pool, hours(49))
    expect(r.done).toBeGreaterThanOrEqual(1)
    // running the cron again does not resend (test 12 for automations)
    r = await runJobs(pool, hours(50))
    const rem = (await pool.query(`select count(*)::int as n from cm_notifications where job_id in (select id from cm_jobs where subject_id = $1 and kind = 'deliverable.submission_reminder')`, [s.did])).rows[0].n
    expect(rem).toBe(1)
    await runJobs(pool, hours(73))
    const d = (await pool.query(`select submission_breached_at from cm_deliverables where id = $1`, [s.did])).rows[0]
    expect(new Date(d.submission_breached_at).getTime()).toBe(s.due.getTime())
    const task = (await pool.query(`select type, priority from cm_tasks where deliverable_id = $1 and type = 'chase_submission'`, [s.did])).rows
    expect(task).toEqual([{ type: 'chase_submission', priority: 'high' }])
  })

  it('a reminder is not sent once the deliverable was submitted (test 13)', async () => {
    const s = await scenario({ dueInHours: 72 })
    const asset = await uploadReady(s.creator, s.pid, hours(1))
    await submitVersion(w.ctx(s.creator, hours(1)), s.did, { asset_id: asset })
    expect(await jobsOf(s.did)).toEqual([
      { kind: 'deliverable.submission_overdue', status: 'cancelled', result: 'submitted' },
      { kind: 'deliverable.submission_reminder', status: 'cancelled', result: 'submitted' },
    ])
    // and even if a job had slipped through, the handler re-checks the status
    await pool.query(`update cm_jobs set status = 'pending' where subject_id = $1`, [s.did])
    await runJobs(pool, hours(80))
    const rows = await jobsOf(s.did)
    expect(rows.every((j) => j.status === 'skipped' && /status submitted/.test(j.result))).toBe(true)
    expect((await pool.query(`select submission_breached_at from cm_deliverables where id = $1`, [s.did])).rows[0].submission_breached_at).toBeNull()
  })

  it('changing the deadline leaves no stale reminder active (test 14)', async () => {
    const s = await scenario({ dueInHours: 72 })
    const v = (await pool.query(`select version from cm_deliverables where id = $1`, [s.did])).rows[0].version
    await expect(updateDeliverable(w.ctx(manager, hours(2)), s.did, { expected_version: v, submission_due_at: hours(120).toISOString() })).rejects.toThrow(/סיבה/)
    await updateDeliverable(w.ctx(manager, hours(2)), s.did, { expected_version: v, submission_due_at: hours(120).toISOString(), publication_due_at: hours(150).toISOString(), deadline_change_reason: 'הלקוח ביקש לדחות' })
    const rows = (await pool.query(`select kind, status, payload->>'dueAt' as due from cm_jobs where subject_id = $1 and kind like 'deliverable.submission%' order by created_at`, [s.did])).rows
    const pending = rows.filter((r) => r.status === 'pending')
    expect(pending.every((r) => new Date(r.due).getTime() === hours(120).getTime())).toBe(true)
    expect(rows.filter((r) => r.status === 'cancelled')).toHaveLength(2)
    // when the OLD reminder time arrives, nothing is sent
    await runJobs(pool, hours(49))
    const sent = (await pool.query(`select count(*)::int as n from cm_notifications n join cm_jobs j on j.id = n.job_id where j.subject_id = $1`, [s.did])).rows[0].n
    expect(sent).toBe(0)
    // the task due date followed the change
    const t = (await pool.query(`select due_at from cm_tasks where deliverable_id = $1 and type = 'submit_content'`, [s.did])).rows[0]
    expect(new Date(t.due_at).getTime()).toBe(hours(120).getTime())
  })

  it('moving a deadline that already passed keeps the lateness on record (test 23)', async () => {
    const s = await scenario({ dueInHours: 24 })
    const v = (await pool.query(`select version from cm_deliverables where id = $1`, [s.did])).rows[0].version
    await updateDeliverable(w.ctx(manager, hours(30)), s.did, { expected_version: v, submission_due_at: hours(96).toISOString(), publication_due_at: hours(120).toISOString(), deadline_change_reason: 'הארכה בדיעבד' })
    const d = (await pool.query(`select submission_breached_at, original_submission_due_at, submission_due_at from cm_deliverables where id = $1`, [s.did])).rows[0]
    expect(new Date(d.submission_breached_at).getTime()).toBe(s.due.getTime())
    expect(new Date(d.original_submission_due_at).getTime()).toBe(s.due.getTime())
    const asset = await uploadReady(s.creator, s.pid, hours(40))
    await submitVersion(w.ctx(s.creator, hours(40)), s.did, { asset_id: asset })
    const report = await getInternalReport(w.ctx(manager, hours(200)), s.campaignId)
    expect(report.rows[0].submittedLate).toBe(true)
    expect(report.metrics.submission).toMatchObject({ onTime: 0, late: 1 })
    // the database refuses to rewrite history directly
    await expect(pool.query(`update cm_deliverables set submission_breached_at = null where id = $1`, [s.did])).rejects.toThrow(/cannot be changed/)
    await expect(pool.query(`update cm_deliverables set original_submission_due_at = now() where id = $1`, [s.did])).rejects.toThrow(/immutable/)
    const hist = (await pool.query(`select reason from cm_deadline_changes where deliverable_id = $1`, [s.did])).rows
    expect(hist).toEqual([{ reason: 'הארכה בדיעבד' }, { reason: 'הארכה בדיעבד' }])
  })

  it('cancelling the campaign stops future jobs, messages and tasks (test 15)', async () => {
    const s = await scenario({ dueInHours: 72 })
    const v = (await pool.query(`select version from cm_campaigns where id = $1`, [s.campaignId])).rows[0].version
    await expect(changeCampaignStatus(w.ctx(manager, hours(1)), s.campaignId, { to: 'cancelled', expected_version: v })).rejects.toThrow(/סיבה/)
    await changeCampaignStatus(w.ctx(manager, hours(1)), s.campaignId, { to: 'cancelled', expected_version: v, reason: 'הלקוח ביטל' })
    const pending = (await pool.query(`select count(*)::int as n from cm_jobs where campaign_id = $1 and status in ('pending','failed')`, [s.campaignId])).rows[0].n
    const msgs = (await pool.query(`select count(*)::int as n from cm_notifications where campaign_id = $1 and status in ('pending','failed')`, [s.campaignId])).rows[0].n
    const tasks = (await pool.query(`select count(*)::int as n from cm_tasks where campaign_id = $1 and status in ('open','in_progress')`, [s.campaignId])).rows[0].n
    expect({ pending, msgs, tasks }).toEqual({ pending: 0, msgs: 0, tasks: 0 })
  })
})

describe('outbox delivery', () => {
  it('a provider failure is retried with backoff and ends in the failure queue (test 16)', async () => {
    const s = await scenario({ dueInHours: 72 })
    const t = w.transport as FakeTransport
    t.mode = 'fail'
    // isolate: only this campaign's messages
    await pool.query(`update cm_notifications set next_attempt_at = 'infinity' where campaign_id <> $1 and status in ('pending','failed')`, [s.campaignId])
    let now = hours(1)
    const r1 = await dispatchNotifications(pool, w.ctx(manager).deps, now)
    expect(r1.failed).toBeGreaterThan(0)
    const n = (await pool.query(`select id, status, attempts, next_attempt_at, last_error from cm_notifications where campaign_id = $1 and status = 'failed' limit 1`, [s.campaignId])).rows[0]
    expect(n).toMatchObject({ status: 'failed', attempts: 1, last_error: 'provider 503' })
    expect(new Date(n.next_attempt_at).getTime()).toBe(now.getTime() + 2 * 60_000)
    // not retried before the backoff elapses
    const early = await dispatchNotifications(pool, w.ctx(manager).deps, new Date(now.getTime() + 60_000))
    expect(early.failed + early.sent).toBe(0)
    for (let i = 0; i < 6; i++) {
      now = new Date(now.getTime() + 7 * 3_600_000)
      await dispatchNotifications(pool, w.ctx(manager).deps, now)
    }
    const dead = (await pool.query(`select status, attempts from cm_notifications where id = $1`, [n.id])).rows[0]
    expect(dead).toEqual({ status: 'dead', attempts: 5 })
    // a manager can put it back; success then records the provider id
    t.mode = 'ok'
    await retryNotification(w.ctx(manager, now), n.id, { action: 'retry' })
    await dispatchNotifications(pool, w.ctx(manager).deps, new Date(now.getTime() + 1000))
    const ok = (await pool.query(`select status, provider_message_id from cm_notifications where id = $1`, [n.id])).rows[0]
    expect(ok.status).toBe('sent')
    expect(ok.provider_message_id).toMatch(/^fake-/)
  })

  it('a timeout becomes "uncertain" and is never resent without confirmation', async () => {
    const s = await scenario({ dueInHours: 72 })
    await pool.query(`update cm_notifications set next_attempt_at = 'infinity' where campaign_id <> $1 and status in ('pending','failed')`, [s.campaignId])
    const t = w.transport as FakeTransport
    t.mode = 'timeout'
    await dispatchNotifications(pool, w.ctx(manager).deps, hours(1))
    const n = (await pool.query(`select id, status from cm_notifications where campaign_id = $1 and status = 'uncertain' limit 1`, [s.campaignId])).rows[0]
    expect(n.status).toBe('uncertain')
    t.mode = 'ok'
    const r = await dispatchNotifications(pool, w.ctx(manager).deps, hours(10))
    expect((await pool.query(`select status from cm_notifications where id = $1`, [n.id])).rows[0].status).toBe('uncertain')
    void r
    expect(await code(retryNotification(w.ctx(manager), n.id, { action: 'retry' }))).toBe('VALIDATION')
    await retryNotification(w.ctx(manager), n.id, { action: 'retry', confirm_possible_duplicate: true })
    expect((await pool.query(`select status from cm_notifications where id = $1`, [n.id])).rows[0].status).toBe('pending')
  })

  it('a job handler crash is retried and then parked as dead', async () => {
    const { rows } = await pool.query(`insert into cm_jobs (kind, dedupe_key, run_after, max_attempts) values ('unknown.kind', $1, $2, 2) returning id`, [`x-${Math.random()}`, T0])
    await runJobs(pool, hours(1))
    await runJobs(pool, hours(2))
    const j = (await pool.query(`select status, attempts, last_error from cm_jobs where id = $1`, [rows[0].id])).rows[0]
    expect(j).toMatchObject({ status: 'dead', attempts: 2 })
    expect(j.last_error).toContain('no handler')
  })
})

describe('uploads (test 17)', () => {
  it('a deliverable is not submitted when the upload did not complete or the file is wrong', async () => {
    const s = await scenario()
    const ctx = w.ctx(s.creator, hours(1))
    const intent = await createUploadIntent(ctx, { participation_id: s.pid, purpose: 'content', filename: 'clip.mp4', mime_type: 'video/mp4', size: 5000 })
    // nothing uploaded yet
    expect((await completeUpload(ctx, intent.asset_id)).status).toBe('pending')
    expect(await code(submitVersion(ctx, s.did, { asset_id: intent.asset_id }))).toBe('VALIDATION')
    // partial upload (size mismatch) → failed, object removed
    const key = (await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])).rows[0].storage_key
    await w.storage.write(key, Buffer.alloc(100), 'video/mp4')
    expect(await code(completeUpload(ctx, intent.asset_id))).toBe('VALIDATION')
    expect(await w.storage.stat(key)).toBeNull()
    // a PNG pretending to be a PDF → failed
    const fake = await createUploadIntent(ctx, { participation_id: s.pid, purpose: 'content', filename: 'x.pdf', mime_type: 'application/pdf', size: PNG_1PX.length })
    const fkey = (await pool.query(`select storage_key from cm_assets where id = $1`, [fake.asset_id])).rows[0].storage_key
    await w.storage.write(fkey, PNG_1PX, 'application/pdf')
    expect(await code(completeUpload(ctx, fake.asset_id))).toBe('VALIDATION')
    expect(await code(submitVersion(ctx, s.did, { asset_id: fake.asset_id }))).toBe('VALIDATION')
    const d = (await pool.query(`select status, current_version_id, first_submitted_at from cm_deliverables where id = $1`, [s.did])).rows[0]
    expect(d).toEqual({ status: 'awaiting_submission', current_version_id: null, first_submitted_at: null })
    // disallowed type / oversized are refused before any upload
    expect(await code(createUploadIntent(ctx, { participation_id: s.pid, purpose: 'content', filename: 'x.exe', mime_type: 'application/x-msdownload', size: 10 }))).toBe('VALIDATION')
    expect(await code(createUploadIntent(ctx, { participation_id: s.pid, purpose: 'content', filename: 'big.png', mime_type: 'image/png', size: 26 * 1024 * 1024 }))).toBe('VALIDATION')
    // a client cannot upload at all
    expect(await code(createUploadIntent(w.ctx(s.client), { participation_id: s.pid, purpose: 'content', filename: 'a.png', mime_type: 'image/png', size: 10 }))).toBe('FORBIDDEN')
  })

  it('orphan cleanup removes stale pending uploads but keeps referenced files', async () => {
    const s = await scenario()
    const ctx = w.ctx(s.creator, hours(1))
    const used = await uploadReady(s.creator, s.pid, hours(1))
    await submitVersion(ctx, s.did, { asset_id: used })
    const orphan = await createUploadIntent(ctx, { participation_id: s.pid, purpose: 'content', filename: 'o.png', mime_type: 'image/png', size: 10 })
    await pool.query(`update cm_assets set created_at = $2 where id = any($1)`, [[orphan.asset_id, used], hours(-24 * 30)])
    await cleanupOrphanAssets(pool, w.storage, hours(1))
    const st = (await pool.query(`select id, status from cm_assets where id = any($1)`, [[orphan.asset_id, used]])).rows
    expect(Object.fromEntries(st.map((r) => [r.id, r.status]))).toEqual({ [orphan.asset_id]: 'deleted', [used]: 'ready' })
  })
})

describe('budget (test 20)', () => {
  it('fee moves planned → committed → actual in place; never counted twice', async () => {
    const s = await scenario()
    let b = await getBudget(w.ctx(manager), s.campaignId)
    expect(b.summary.committed).toBe(BigInt(600000))
    const fee = b.lines.find((l) => l.source === 'participation_fee')!
    await addBudgetLine(w.ctx(manager), s.campaignId, { category: 'production', description: 'צילום', amount: '3000', status: 'committed' })
    b = await getBudget(w.ctx(manager), s.campaignId)
    const prod = b.lines.find((l) => l.category === 'production')!
    await updateBudgetLine(w.ctx(manager), prod.id, { expected_version: prod.version, status: 'actual', amount: '2800' })
    await updateBudgetLine(w.ctx(manager), fee.id, { expected_version: fee.version, status: 'actual' })
    b = await getBudget(w.ctx(manager), s.campaignId)
    expect(b.summary).toMatchObject({ committed: BigInt(0), actual: BigInt(880000), exposure: BigInt(880000), available: BigInt(2000000 - 880000), overrun: BigInt(0) })
    // actual rows are locked; payment recorded on the participation
    const prod2 = b.lines.find((l) => l.id === prod.id)!
    expect(await code(updateBudgetLine(w.ctx(manager), prod.id, { expected_version: prod2.version, amount: '1' }))).toBe('PRECONDITION_FAILED')
    expect((await pool.query(`select payment_status from cm_participations where id = $1`, [s.pid])).rows[0].payment_status).toBe('paid_manual')
    // changing the fee after it was paid is refused (needs a separate line)
    const pv = (await pool.query(`select version from cm_participations where id = $1`, [s.pid])).rows[0].version
    expect(await code(updateParticipationTerms(w.ctx(manager), s.pid, { expected_version: pv, agreed_fee: '9000' }))).toBe('PRECONDITION_FAILED')
  })

  it('a stale version is refused instead of overwriting (lost update)', async () => {
    const s = await scenario()
    const b = await getBudget(w.ctx(manager), s.campaignId)
    const fee = b.lines[0]
    expect(await code(updateBudgetLine(w.ctx(manager), fee.id, { expected_version: fee.version + 5, status: 'actual' }))).toBe('VERSION_CONFLICT')
  })
})

describe('terms changes after approval', () => {
  it('a material change after acceptance requires re-acceptance; the old acceptance stays on record', async () => {
    const s = await scenario()
    const pv = (await pool.query(`select version, terms_version from cm_participations where id = $1`, [s.pid])).rows[0]
    await updateParticipationTerms(w.ctx(manager), s.pid, { expected_version: pv.version, agreed_fee: '7500' })
    const p = (await pool.query(`select creator_reacceptance_required, accepted_terms_version, terms_version from cm_participations where id = $1`, [s.pid])).rows[0]
    expect(p.creator_reacceptance_required).toBe(true)
    expect(p.accepted_terms_version).toBeLessThan(p.terms_version)
    // re-accepting with the old terms version is refused
    expect(await code(respondToInvitation(w.ctx(s.creator), s.pid, { response: 'accepted', terms_version: pv.terms_version }))).toBe('STALE_TARGET')
    await respondToInvitation(w.ctx(s.creator), s.pid, { response: 'accepted', terms_version: p.terms_version })
    expect((await pool.query(`select creator_reacceptance_required from cm_participations where id = $1`, [s.pid])).rows[0].creator_reacceptance_required).toBe(false)
    const b = await getBudget(w.ctx(manager), s.campaignId)
    expect(b.summary.committed).toBe(BigInt(750000))
  })

  it('rights expiry raises an internal alert 30 days ahead (automation 12)', async () => {
    const s = await scenario()
    const pv = (await pool.query(`select version from cm_participations where id = $1`, [s.pid])).rows[0].version
    await updateParticipationTerms(w.ctx(manager, T0), s.pid, { expected_version: pv, rights_expires_at: '2026-12-15' })
    await runJobs(pool, new Date('2026-11-16T08:00:00Z'))
    const t = (await pool.query(`select type from cm_tasks where participation_id = $1 and type = 'rights_expiring'`, [s.pid])).rows
    expect(t).toHaveLength(1)
  })
})

describe('closing (test 25)', () => {
  it('closing with open items needs an authorized person and a documented reason', async () => {
    const s = await scenario()
    for (const to of ['planning', 'recruiting', 'active', 'reporting'] as const) {
      const v = (await pool.query(`select version from cm_campaigns where id = $1`, [s.campaignId])).rows[0].version
      await changeCampaignStatus(w.ctx(manager), s.campaignId, { to, expected_version: v })
    }
    const issues = await closeCheck(w.ctx(manager), s.campaignId)
    expect(issues.map((i) => i.code)).toContain('open_deliverables')
    let v = (await pool.query(`select version from cm_campaigns where id = $1`, [s.campaignId])).rows[0].version
    expect(await code(changeCampaignStatus(w.ctx(manager), s.campaignId, { to: 'closed', expected_version: v }))).toBe('PRECONDITION_FAILED')
    expect(await code(changeCampaignStatus(w.ctx(manager), s.campaignId, { to: 'closed', expected_version: v, close_with_exceptions: true }))).toBe('VALIDATION')
    // a co-manager who is not the owner may not override
    const co = await makeUser(pool, 'manager', 'co-manager')
    await pool.query(`insert into cm_campaign_members (campaign_id, user_id, role) values ($1,$2,'manager')`, [s.campaignId, co.userId])
    expect(await code(changeCampaignStatus(w.ctx(co), s.campaignId, { to: 'closed', expected_version: v, close_with_exceptions: true, reason: 'רוצה לסגור' }))).toBe('FORBIDDEN')
    await changeCampaignStatus(w.ctx(manager), s.campaignId, { to: 'closed', expected_version: v, close_with_exceptions: true, reason: 'היוצר עזב, התוצר לא יופק' })
    const c = (await pool.query(`select status, closed_with_exceptions, status_reason from cm_campaigns where id = $1`, [s.campaignId])).rows[0]
    expect(c).toEqual({ status: 'closed', closed_with_exceptions: true, status_reason: 'היוצר עזב, התוצר לא יופק' })
    v = (await pool.query(`select version from cm_campaigns where id = $1`, [s.campaignId])).rows[0].version
    expect(await code(changeCampaignStatus(w.ctx(manager), s.campaignId, { to: 'active', expected_version: v }))).toBe('INVALID_TRANSITION')
    const audit = (await pool.query(`select summary from cm_audit_events where campaign_id = $1 and action = 'campaign.closed'`, [s.campaignId])).rows
    expect(audit[0].summary).toContain('חריגות')
  })
})

void runWorker

describe('list endpoints run with every filter combination', () => {
  it('tasks, campaigns, creators, activity', async () => {
    const s = await scenario()
    const { listTasks } = await import('../services/tasks')
    const { listCampaigns } = await import('../services/campaigns')
    const { listCreators } = await import('../services/creators')
    const { campaignActivity, campaignOverview, campaignQueue } = await import('../services/overview')
    const c = w.ctx(manager, hours(200))
    for (const f of [{}, { mine: 'true' }, { overdue: 'true' }, { campaign_id: s.campaignId }, { status: 'done' }, { audience: 'creator', overdue: 'true', mine: 'true' }]) {
      const r = await listTasks(c, f)
      expect(r.total).toBeGreaterThanOrEqual(r.rows.length)
    }
    expect((await listTasks(c, { campaign_id: s.campaignId, overdue: 'true' })).rows.every((t: Record<string, unknown>) => t.overdue === true)).toBe(true)
    for (const f of [{}, { q: 'ops' }, { status: 'draft' }, { client_id: clientId }, { owner_user_id: manager.userId }, { from: '2026-01-01', to: '2027-01-01' }, { page: '2', page_size: '1' }]) {
      await listCampaigns(c, f)
    }
    for (const f of [{}, { q: 'c-' }, { category: 'x' }, { platform: 'instagram' }, { status: 'active' }, { exclude_campaign_id: s.campaignId }]) {
      await listCreators(c, f)
    }
    await campaignActivity(c, s.campaignId, { page: '1' })
    const ov = await campaignOverview(c, s.campaignId)
    expect(ov.counts.overdue_submissions).toBe(1)
    await campaignQueue(c, s.campaignId)
  })
})
