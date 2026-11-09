/**
 * Development seed for the campaigns module. LOCAL DATABASE ONLY.
 *
 *   npx tsx scripts/campaigns/seed.ts            (after: npx tsx scripts/campaigns/db.ts reset)
 *
 * Everything is synthetic (example.test / .example addresses). Data is created
 * through the real services so every state is one a user could reach. Users
 * have no passwords: locally you sign in through the dev login
 * (CAMPAIGNS_DEV_AUTH=true), which does not exist in production builds.
 * Prints single-use portal links for the demo client and creators.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Pool } from 'pg'
import { assertLocal } from './db'
import type { Ctx, InternalActor, PortalActor } from '../../src/lib/campaigns/context'
import { LocalStorage } from '../../src/lib/campaigns/storage/local'
import { DevTransport } from '../../src/lib/campaigns/messaging/transport'
import { redeemToken, resolvePortalSession } from '../../src/lib/campaigns/portal/access'
import { createCampaign, changeCampaignStatus } from '../../src/lib/campaigns/services/campaigns'
import { createAgent, createCreator, createTalentAgency } from '../../src/lib/campaigns/services/creators'
import { addCreatorsToCampaign, participationAction, respondToInvitation, updateParticipationTerms } from '../../src/lib/campaigns/services/participations'
import { clientShortlistDecision, createShortlist, internalShortlistDecision, sendShortlistToClient } from '../../src/lib/campaigns/services/shortlists'
import {
  addMetrics, clientContentDecision, createDeliverable, internalContentDecision, reportPublication, submitVersion, verifyPublication,
} from '../../src/lib/campaigns/services/deliverables'
import { completeUpload, createUploadIntent } from '../../src/lib/campaigns/services/assets'
import { createGrant, createOrgGrant } from '../../src/lib/campaigns/services/grants'
import { addBudgetLine } from '../../src/lib/campaigns/services/budget'
import { upsertShipment } from '../../src/lib/campaigns/services/shipments'

if (process.env.NODE_ENV === 'production') throw new Error('seed refuses to run in production')
const url = process.env.CAMPAIGNS_DATABASE_URL || 'postgres://postgres@localhost:54329/leaders_dev'
assertLocal(url)

const pool = new Pool({ connectionString: url })
const storage = new LocalStorage({ root: path.resolve(process.env.CAMPAIGNS_LOCAL_STORAGE_DIR || '.data/campaign-media'), baseUrl: '' })
const deps = { storage, transport: new DevTransport(), baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000' }
const ctx = (actor: Ctx['actor'], now = new Date()): Ctx => ({ db: pool, actor, now, deps })
const H = 3_600_000
const D = 24 * H
const now = Date.now()
const at = (offsetMs: number) => new Date(now + offsetMs)
const iso = (offsetMs: number) => at(offsetMs).toISOString()

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')

interface Org { id: string; name: string }

async function org(name: string, slug: string, settings: Record<string, unknown> = {}): Promise<Org> {
  const { rows } = await pool.query(`insert into cm_organizations (name, slug, settings) values ($1,$2,$3) returning id`, [name, slug, settings])
  return { id: rows[0].id, name }
}

/** A staff account (no password; local dev login only) with an active membership. */
async function user(name: string, email: string, role: 'admin' | 'manager' | 'staff', o: Org): Promise<InternalActor> {
  const { rows } = await pool.query(`insert into cm_accounts (email, full_name, email_verified_at) values ($1,$2,now()) returning id`, [email, name])
  await pool.query(`insert into cm_memberships (organization_id, account_id, role) values ($1,$2,$3)`, [o.id, rows[0].id, role])
  return { kind: 'internal', userId: rows[0].id, email, name, role, orgId: o.id, orgName: o.name }
}

async function portal(inviteUrl: string, when = new Date()): Promise<PortalActor> {
  const token = new URL(inviteUrl).hash.slice(1).split('&').find((p) => p.startsWith('t='))!.slice(2)
  const { sessionSecret } = await redeemToken(pool, token, when)
  return (await resolvePortalSession(pool, sessionSecret, when))!
}

async function upload(c: Ctx, participationId: string, purpose: 'content' | 'evidence' | 'metric_evidence' = 'content') {
  const intent = await createUploadIntent(c, { participation_id: participationId, purpose, filename: `${purpose}.png`, mime_type: 'image/png', size: PNG.length })
  const { rows } = await pool.query(`select storage_key from cm_assets where id = $1`, [intent.asset_id])
  await storage.write(rows[0].storage_key, PNG, 'image/png')
  await completeUpload(c, intent.asset_id)
  return intent.asset_id
}

const pv = async (pid: string) => (await pool.query(`select version, terms_version from cm_participations where id = $1`, [pid])).rows[0]

async function main() {
  const existing = await pool.query(`select count(*)::int as n from cm_campaigns`)
  if (existing.rows[0].n > 0) throw new Error('database already has campaigns; run db.ts reset first')

  // Tenant 1: Leaders (Hub-linked). Tenant 2: another agency, to show isolation.
  const leaders = await org('לידרס (הדגמה)', 'leaders-demo', { hub_integration: true })
  const other = await org('סוכנות דמו ב׳', 'agency-b-demo')
  // Platform admin: a separate account with no membership (set BRIEFLOW_PLATFORM_ADMINS=platform@brieflow.example)
  await pool.query(`insert into cm_accounts (email, full_name, email_verified_at) values ('platform@brieflow.example', 'מנהל/ת Brieflow', now())`)
  const admin = await user('אדמין לידרס', 'admin@leaders.example', 'admin', leaders)
  const noa = await user('נועה כהן', 'noa@leaders.example', 'manager', leaders)
  const dana = await user('דנה לוי', 'dana@leaders.example', 'manager', leaders)
  const staff = await user('יואב צוות', 'yoav@leaders.example', 'staff', leaders)
  const bAdmin = await user('מיכל (סוכנות ב׳)', 'michal@agency-b.example', 'admin', other)
  // A consultant who works with both agencies: one account, two memberships.
  await pool.query(`insert into cm_memberships (organization_id, account_id, role) values ($1, $2, 'staff')`, [other.id, dana.userId])

  const client = async (o: Org, name: string, secondary: string) =>
    (await pool.query(`insert into cm_clients (organization_id, name, name_secondary) values ($1,$2,$3) returning id`, [o.id, name, secondary])).rows[0]
  const adidas = await client(leaders, 'אדידס ישראל (הדגמה)', 'Adidas Israel')
  const fresh = await client(leaders, 'פרשג׳וס (הדגמה)', 'FreshJuice')
  const { rows: [dt] } = await pool.query(`select id from document_types where slug = 'client-brief'`)
  const { rows: [brief] } = await pool.query(
    `insert into document_links (document_type_id, created_by_email, client_name, status, completed_at, metadata)
     values ($1, $2, 'אדידס ישראל (הדגמה)', 'completed', now(), $3) returning id`,
    [dt.id, noa.email, { salesforce_ref: 'DEMO-SF-001', submission_data: { clientName: 'אדידס ישראל', productService: 'Ultraboost 2026', campaignGoalTypes: ['מודעות', 'מכירות'], campaignGoalsDescription: 'השקת נעל ריצה לקהל צעיר', campaignLaunchDate: new Date(now).toISOString().slice(0, 10), budget: '150,000 ₪' } }])

  // Talent agency representing three creators, with two agents; twelve creators total.
  const stars = await createTalentAgency(ctx(noa), { name: 'סוכנות כוכבים (הדגמה)', email: 'office@stars.example' })
  const roni = await createAgent(ctx(noa), { display_name: 'רוני (סוכנות כוכבים)', email: 'roni@stars.example', talent_agency_id: stars.id })
  const shir = await createAgent(ctx(noa), { display_name: 'שיר (סוכנות כוכבים)', email: 'shir@stars.example', talent_agency_id: stars.id })
  const names = [
    ['יעל רצה', 'yael.runs', 'ספורט'], ['עומר פיט', 'omer.fit', 'ספורט'], ['מאיה סטייל', 'maya.style', 'אופנה'], ['איתי מבשל', 'itay.cooks', 'אוכל'],
    ['נועם טק', 'noam.tech', 'טכנולוגיה'], ['שירה יוגה', 'shira.yoga', 'ספורט'], ['רון טיולים', 'ron.trips', 'טיולים'], ['טל מוזיקה', 'tal.music', 'מוזיקה'],
    ['גל ביוטי', 'gal.beauty', 'יופי'], ['אור הורות', 'or.parents', 'הורות'], ['דניאל גיימר', 'daniel.games', 'גיימינג'], ['ליה ריקוד', 'lia.dance', 'ריקוד'],
  ]
  const creators: string[] = []
  for (const [i, [n, h, cat]] of names.entries()) {
    const c = await createCreator(ctx(noa), {
      display_name: n, email: `${h}@creators.example`, phone: `05${String(20000000 + i * 1111).slice(0, 8)}`, categories: [cat],
      talent_agency_id: i < 3 ? stars.id : null, agent_id: i < 2 ? roni.id : i === 2 ? shir.id : null, social_accounts: [{ platform: i % 3 === 2 ? 'tiktok' : 'instagram', handle: h, follower_count: 15000 + i * 7300 }],
    })
    creators.push(c.id)
  }

  // ── Campaign A: Adidas, active, within budget ────────────────────────────
  const A = (await createCampaign(ctx(noa, at(-20 * D)), {
    client_id: adidas.id, name: 'אדידס Ultraboost — השקה (הדגמה)', brief_document_link_id: brief.id, external_project_reference: 'DEMO-SF-001',
    description: 'השקת נעל הריצה בקרב רצים צעירים.', objectives: 'מודעות + תנועה לחנות', start_date: iso(-20 * D).slice(0, 10), end_date: iso(25 * D).slice(0, 10),
    approved_budget: '150000', currency: 'ILS',
  })).id
  await pool.query(`insert into cm_campaign_members (campaign_id, user_id, role) values ($1,$2,'staff')`, [A, staff.userId])
  for (const [to, v] of [['planning', 1], ['recruiting', 2]] as const) await changeCampaignStatus(ctx(noa), A, { to, expected_version: v })

  const aIds = creators.slice(0, 7)
  const aParts = (await addCreatorsToCampaign(ctx(noa, at(-18 * D)), A, { creator_ids: aIds })).added
  const fees = ['12000', '9500', '15000', '7000', '11000', '8000', '6500']
  for (const [i, p] of aParts.entries()) {
    await updateParticipationTerms(ctx(noa), p, { expected_version: 1, agreed_fee: fees[i], deliverables_summary: 'ריל אחד + 3 סטוריז', client_visible_notes: 'קהל ספורט 18–34', internal_notes: 'מחיר כולל שימוש 3 חודשים' })
  }
  const slA = await createShortlist(ctx(noa, at(-17 * D)), A, { participation_ids: aParts.slice(0, 6) })
  const itemsA = (await pool.query(`select id, participation_id from cm_shortlist_items where shortlist_id = $1`, [slA.id])).rows
  for (const it of itemsA) {
    const reject = it.participation_id === aParts[5]
    await internalShortlistDecision(ctx(noa, at(-17 * D)), slA.id, it.id, reject ? { decision: 'rejected', feedback: 'קהל לא תואם', shortlist_version: 1 } : { decision: 'approved', shortlist_version: 1 })
  }
  const clientGrantA = await createGrant(ctx(noa, at(-17 * D)), A, { kind: 'client', recipient_name: 'רונית (אדידס)', recipient_email: 'ronit@adidas.example' })
  const clientA = await portal(clientGrantA.inviteUrl, at(-16 * D))
  await sendShortlistToClient(ctx(noa, at(-16 * D)), slA.id)
  for (const it of itemsA.filter((x) => x.participation_id !== aParts[5])) {
    if (it.participation_id === aParts[4]) await clientShortlistDecision(ctx(clientA, at(-15 * D)), it.id, { decision: 'changes_requested', feedback: 'מעדיפים מישהו עם קהל רצים', shortlist_version: 1 })
    else await clientShortlistDecision(ctx(clientA, at(-15 * D)), it.id, { decision: 'approved', shortlist_version: 1 })
  }
  await changeCampaignStatus(ctx(noa), A, { to: 'active', expected_version: 3 })

  const deliv = async (p: string, title: string, subDays: number, pubDays: number, type = 'reel') =>
    (await createDeliverable(ctx(noa, at(-13 * D)), p, { title, type, platform: 'instagram', description: 'להציג את הנעל בריצת בוקר. לציין את ההשקה.', submission_due_at: iso(subDays * D), publication_due_at: iso(pubDays * D), required_tags: ['#adidas', '#ultraboost'], required_mentions: ['@adidasisrael'] })).id

  // Deliverables are defined before the creators are invited (as in a real flow),
  // so accepting the invitation covers them.
  const d1 = await deliv(aParts[0], 'ריל השקה', -8, -5)
  const dLate = await deliv(aParts[0], 'סטורי 1', -3, 1, 'story')
  const d5 = await deliv(aParts[0], 'סטורי 2', -6, -1, 'story')
  const d2 = await deliv(aParts[1], 'ריל אימון', -1, 4)
  const d3 = await deliv(aParts[2], 'ריל סטייל', 2, 6)
  const d4 = await deliv(aParts[3], 'ריל בישול אחרי ריצה', 3, 8)
  void dLate

  // Invite + accept the four approved creators; each gets deliverables.
  const creatorActors: PortalActor[] = []
  const links: string[] = []
  for (const [i, p] of aParts.slice(0, 4).entries()) {
    const viaAgent = i < 2
    const inv = await participationAction(ctx(noa, at(-14 * D)), p, viaAgent
      ? { action: 'invite', expected_version: (await pv(p)).version, via: 'agency', recipient_name: 'סוכנות כוכבים', recipient_email: 'office@stars.example' }
      : { action: 'invite', expected_version: (await pv(p)).version, recipient_name: names[i][0], recipient_email: `${names[i][1]}@creators.example` })
    const actor = await portal(inv.invite_url!, at(-14 * D))
    creatorActors.push(actor)
    await respondToInvitation(ctx(actor, at(-13 * D)), p, { response: 'accepted', terms_version: (await pv(p)).terms_version })
  }
  // p0 (via agent): verified publication with metrics + a late story
  const c0 = ctx(creatorActors[0], at(-9 * D))
  const v1 = await submitVersion(c0, d1, { asset_id: await upload(c0, aParts[0]), caption: 'גרסה ראשונה #adidas' })
  await internalContentDecision(ctx(noa, at(-9 * D + H)), d1, { version_id: v1.version_id, decision: 'changes_requested', feedback: 'הלוגו לא נראה בשנייה הראשונה' })
  const v2 = await submitVersion(ctx(creatorActors[0], at(-8.5 * D)), d1, { asset_id: await upload(ctx(creatorActors[0]), aParts[0]), caption: 'גרסה 2 #adidas #ultraboost', based_on_version_id: v1.version_id })
  await internalContentDecision(ctx(noa, at(-8 * D)), d1, { version_id: v2.version_id, decision: 'approved' })
  await clientContentDecision(ctx(clientA, at(-7 * D)), d1, { version_id: v2.version_id, decision: 'approved' })
  await reportPublication(ctx(creatorActors[0], at(-5 * D + 2 * H)), d1, { published_url: 'https://www.instagram.com/p/DEMO1', reported_published_at: iso(-5 * D + H) })
  const pub1 = (await pool.query(`select version from cm_publications where deliverable_id = $1`, [d1])).rows[0]
  await verifyPublication(ctx(noa, at(-4 * D)), d1, { decision: 'verified', actual_published_at: iso(-5 * D + H), evidence_asset_id: await upload(ctx(noa), aParts[0], 'evidence'), expected_publication_version: pub1.version })
  await addMetrics(ctx(creatorActors[0], at(-2 * D)), d1, { captured_at: iso(-2 * D), measurement_period: '7d', values: { views: 48200, likes: 3100, comments: 0, shares: 210 }, evidence_asset_id: await upload(ctx(creatorActors[0]), aParts[0], 'metric_evidence') })

  // p1 (via agent): waiting for client approval
  const c1 = ctx(creatorActors[1], at(-2 * D))
  const v3 = await submitVersion(c1, d2, { asset_id: await upload(c1, aParts[1]), caption: 'אימון בוקר #adidas' })
  await internalContentDecision(ctx(noa, at(-1 * D)), d2, { version_id: v3.version_id, decision: 'approved' })

  // p2: submitted, waiting for internal review; p3: changes requested
  const c2 = ctx(creatorActors[2], at(-6 * H))
  await submitVersion(c2, d3, { asset_id: await upload(c2, aParts[2]), caption: 'לוק ספורטיבי' })
  const c3 = ctx(creatorActors[3], at(-1 * D))
  const v5 = await submitVersion(c3, d4, { external_url: 'https://drive.example/demo-video', caption: 'טיוטה' })
  await internalContentDecision(ctx(noa, at(-12 * H)), d4, { version_id: v5.version_id, decision: 'changes_requested', feedback: 'צריך להראות את הנעל בפריים הראשון' })
  // p0 also: approved, publication overdue
  const v6 = await submitVersion(ctx(creatorActors[0], at(-7 * D)), d5, { asset_id: await upload(ctx(creatorActors[0]), aParts[0]) })
  await internalContentDecision(ctx(noa, at(-6.5 * D)), d5, { version_id: v6.version_id, decision: 'approved' })
  await clientContentDecision(ctx(clientA, at(-6 * D)), d5, { version_id: v6.version_id, decision: 'approved' })
  await addBudgetLine(ctx(noa), A, { category: 'production', description: 'צלם לריל ההשקה', amount: '4500', status: 'committed', source_reference: 'PO-1001' })
  await addBudgetLine(ctx(noa), A, { category: 'shipping', description: 'שליחויות זוגות נעליים', amount: '600', status: 'actual' })
  await upsertShipment(ctx(noa), aParts[0], { status: 'delivered', carrier_name: 'שליח עד הבית', tracking_number: 'IL123456', dispatched_at: iso(-15 * D), delivered_at: iso(-14 * D) })
  await upsertShipment(ctx(noa), aParts[2], { status: 'shipped', carrier_name: 'דואר ישראל', tracking_number: 'RR987654IL', tracking_url: 'https://israelpost.example/track/RR987654IL', dispatched_at: iso(-1 * D), shipping_address: 'כתובת הדגמה, תל אביב' })
  await updateParticipationTerms(ctx(noa), aParts[1], { expected_version: (await pv(aParts[1])).version, rights_expires_at: iso(20 * D).slice(0, 10), rights_notes: 'שימוש אורגני בלבד' }) // after acceptance → shows the re-approval flag

  // ── Campaign B: FreshJuice, over budget; shares one creator with A ──────
  const B = (await createCampaign(ctx(dana, at(-10 * D)), {
    client_id: fresh.id, name: 'פרשג׳וס קיץ (הדגמה)', start_date: iso(-10 * D).slice(0, 10), end_date: iso(30 * D).slice(0, 10), approved_budget: '20000',
  })).id
  for (const [to, v] of [['planning', 1], ['recruiting', 2]] as const) await changeCampaignStatus(ctx(dana), B, { to, expected_version: v })
  const bParts = (await addCreatorsToCampaign(ctx(dana, at(-9 * D)), B, { creator_ids: [creators[0], creators[7], creators[8], creators[9]] })).added
  for (const [i, p] of bParts.entries()) await updateParticipationTerms(ctx(dana), p, { expected_version: 1, agreed_fee: ['5000', '9000', '8000', '4000'][i] })
  const slB = await createShortlist(ctx(dana, at(-9 * D)), B, { participation_ids: bParts.slice(0, 3) })
  for (const it of (await pool.query(`select id from cm_shortlist_items where shortlist_id = $1`, [slB.id])).rows) {
    await internalShortlistDecision(ctx(dana, at(-9 * D)), slB.id, it.id, { decision: 'approved', shortlist_version: 1 })
  }
  const clientGrantB = await createGrant(ctx(dana, at(-9 * D)), B, { kind: 'client', recipient_name: 'אבי (פרשג׳וס)', recipient_email: 'avi@freshjuice.example' })
  const clientB = await portal(clientGrantB.inviteUrl, at(-9 * D))
  await sendShortlistToClient(ctx(dana, at(-9 * D)), slB.id)
  for (const it of (await pool.query(`select id from cm_shortlist_items where shortlist_id = $1`, [slB.id])).rows) {
    await clientShortlistDecision(ctx(clientB, at(-8 * D)), it.id, { decision: 'approved', shortlist_version: 1 })
  }
  for (const p of bParts.slice(0, 3)) {
    await createDeliverable(ctx(dana, at(-8 * D)), p, { title: 'פוסט קיץ', type: 'post', platform: 'instagram', submission_due_at: iso(5 * D), publication_due_at: iso(9 * D) })
    const inv = await participationAction(ctx(dana, at(-8 * D)), p, { action: 'invite', expected_version: (await pv(p)).version, recipient_name: 'יוצר', recipient_email: null })
    const a = await portal(inv.invite_url!, at(-8 * D))
    await respondToInvitation(ctx(a, at(-7 * D)), p, { response: 'accepted', terms_version: (await pv(p)).terms_version })
  }
  await addBudgetLine(ctx(dana), B, { category: 'production', description: 'סט צילום', amount: '3500', status: 'committed' })
  await changeCampaignStatus(ctx(dana), B, { to: 'active', expected_version: 3 })

  // Tenant 2 has its own client, creator and campaign; Leaders never sees them.
  const bClient = await client(other, 'לקוח של סוכנות ב׳', 'Agency B client')
  const bCtx = ctx(bAdmin)
  const bCampaign = (await createCampaign(bCtx, { client_id: bClient.id, name: 'קמפיין של סוכנות ב׳ (הדגמה)', approved_budget: '30000' })).id
  const bCreator = await createCreator(bCtx, { display_name: 'יוצרת של סוכנות ב׳', email: 'yael.runs@creators.example', social_accounts: [{ platform: 'instagram', handle: 'b.creator' }] })
  await addCreatorsToCampaign(bCtx, bCampaign, { creator_ids: [bCreator.id] })

  // Fresh portal links for manual testing (single use each).
  const freshLinks = {
    clientA: (await createOrgGrant(ctx(noa), { kind: 'client', client_id: adidas.id, recipient_name: 'רונית (אדידס) — בדיקה', recipient_email: 'ronit@adidas.example' })).inviteUrl,
    agency: (await createOrgGrant(ctx(noa), { kind: 'agency', talent_agency_id: stars.id, recipient_name: 'סוכנות כוכבים — בדיקה', recipient_email: 'office@stars.example' })).inviteUrl,
    agent: (await createOrgGrant(ctx(noa), { kind: 'agent', agent_id: roni.id, recipient_name: 'רוני — בדיקה', recipient_email: 'roni@stars.example' })).inviteUrl,
    creatorP2: (await createGrant(ctx(noa), A, { kind: 'creator', creator_id: creators[2], recipient_name: `${names[2][0]} — בדיקה` })).inviteUrl,
    creatorP3: (await createGrant(ctx(noa), A, { kind: 'creator', creator_id: creators[3], recipient_name: `${names[3][0]} — בדיקה` })).inviteUrl,
    clientB: (await createGrant(ctx(dana), B, { kind: 'client', recipient_name: 'אבי — בדיקה' })).inviteUrl,
  }
  links.push(...Object.entries(freshLinks).map(([k, v]) => `${k.padEnd(10)} ${v}`))

  console.log('Seeded campaigns module (synthetic data only).')
  console.log('Organizations: ', [leaders, other].map((o) => o.name).join(' | '))
  console.log('Staff (dev login): ', [admin, noa, dana, staff, bAdmin].map((u) => `${u.name} (${u.role}, ${u.orgName})`).join(', '), '+ platform@brieflow.example (platform admin)')
  console.log('Single-use portal links (valid 14 days, local only):')
  for (const l of links) console.log('  ' + l)
}

main().then(() => pool.end()).catch(async (e) => {
  console.error(e)
  await pool.end()
  process.exit(1)
})
