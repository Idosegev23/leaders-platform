import Link from 'next/link'
import { getCampaign, closeCheck, listMembers, listStaff } from '@/lib/campaigns/services/campaigns'
import { campaignActivity, campaignOverview, campaignQueue } from '@/lib/campaigns/services/overview'
import { listCampaignParticipations } from '@/lib/campaigns/services/participations'
import { listShortlists } from '@/lib/campaigns/services/shortlists'
import { listCampaignDeliverables } from '@/lib/campaigns/services/deliverables'
import { listTasks } from '@/lib/campaigns/services/tasks'
import { getBudget } from '@/lib/campaigns/services/budget'
import { getInternalReport, listReportSnapshots } from '@/lib/campaigns/services/reporting'
import { listGrants } from '@/lib/campaigns/services/grants'
import { listAgents } from '@/lib/campaigns/services/creators'
import { formatDate } from '@/lib/campaigns/domain/time'
import { StatusBadge, Tabs } from '@/components/campaigns/ui'
import { OverviewTab } from '@/components/campaigns/workspace/overview-tab'
import { CreatorsTab } from '@/components/campaigns/workspace/creators-tab'
import { DeliverablesTab } from '@/components/campaigns/workspace/deliverables-tab'
import { TasksTab } from '@/components/campaigns/workspace/tasks-tab'
import { BudgetTab } from '@/components/campaigns/workspace/budget-tab'
import { ReportTab } from '@/components/campaigns/workspace/report-tab'
import { ActivityTab } from '@/components/campaigns/workspace/activity-tab'
import { AccessTab } from '@/components/campaigns/workspace/access-tab'
import { load, pageCtx } from '../_server'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'overview', label: 'סקירה' },
  { key: 'creators', label: 'משפיענים' },
  { key: 'deliverables', label: 'תוצרים ואישורים' },
  { key: 'tasks', label: 'משימות ולוח זמנים' },
  { key: 'budget', label: 'תקציב' },
  { key: 'report', label: 'דוח' },
  { key: 'activity', label: 'פעילות' },
  { key: 'access', label: 'גישה והזמנות' },
] as const

// JSON round-trip (Date → ISO string, bigint → string) so client components
// receive plain data; each tab declares the serialized shape it expects.
const ser = (v: unknown): never => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))) as never

export default async function CampaignPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string; page?: string } }) {
  const ctx = await pageCtx()
  const campaign = await load(() => getCampaign(ctx, params.id))
  const manage = campaign.access_level === 'manage'
  const tab = TABS.some((t) => t.key === searchParams.tab) ? (searchParams.tab as (typeof TABS)[number]['key']) : 'overview'
  const visibleTabs = TABS.filter((t) => manage || t.key !== 'access')

  let body: React.ReactNode = null
  switch (tab) {
    case 'overview': {
      const [overview, issues] = await Promise.all([campaignOverview(ctx, params.id), closeCheck(ctx, params.id)])
      body = <OverviewTab campaign={campaign} overview={ser(overview)} closeIssues={issues} manage={manage} isOwnerOrAdmin={ctx.actor.role === 'admin' || campaign.owner_user_id === ctx.actor.userId} />
      break
    }
    case 'creators': {
      const [participations, shortlists, agents] = await Promise.all([listCampaignParticipations(ctx, params.id), listShortlists(ctx, params.id), listAgents(ctx)])
      body = <CreatorsTab campaign={campaign} participations={ser(participations)} shortlists={ser(shortlists)} agents={agents} manage={manage} />
      break
    }
    case 'deliverables': {
      const deliverables = await listCampaignDeliverables(ctx, params.id)
      body = <DeliverablesTab campaignId={params.id} deliverables={ser(deliverables)} />
      break
    }
    case 'tasks': {
      const [tasks, staff, deliverables] = await Promise.all([
        listTasks(ctx, { campaign_id: params.id, status: 'active', page_size: 200 }), listStaff(ctx), listCampaignDeliverables(ctx, params.id),
      ])
      body = <TasksTab campaignId={params.id} tasks={ser(tasks.rows)} staff={staff} deliverables={ser(deliverables)} />
      break
    }
    case 'budget': {
      const budget = await getBudget(ctx, params.id)
      body = <BudgetTab campaignId={params.id} budget={ser(budget)} manage={manage} />
      break
    }
    case 'report': {
      const [report, snapshots] = await Promise.all([getInternalReport(ctx, params.id), listReportSnapshots(ctx, params.id)])
      body = <ReportTab campaignId={params.id} report={ser(report)} snapshots={ser(snapshots)} manage={manage} />
      break
    }
    case 'activity': {
      const [activity, queue] = await Promise.all([
        campaignActivity(ctx, params.id, { page: searchParams.page ?? '1' }),
        manage ? campaignQueue(ctx, params.id) : Promise.resolve(null),
      ])
      body = <ActivityTab campaignId={params.id} activity={ser(activity)} queue={ser(queue)} />
      break
    }
    case 'access': {
      const [grants, members, staff, participations] = await Promise.all([
        listGrants(ctx, params.id), listMembers(ctx, params.id), listStaff(ctx), listCampaignParticipations(ctx, params.id),
      ])
      body = <AccessTab campaignId={params.id} grants={ser(grants)} members={members} staff={staff} participations={ser(participations)} />
      break
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/campaigns" className="text-xs text-wizard-text-secondary hover:underline">← כל הקמפיינים</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <StatusBadge status={campaign.status} />
          {campaign.closed_with_exceptions && <StatusBadge status="exception" label="נסגר עם חריגות" />}
        </div>
        <p className="mt-1 text-sm text-wizard-text-secondary">
          {campaign.client_name} · {formatDate(campaign.start_date)} – {formatDate(campaign.end_date)} · אחראית: {campaign.owner_name ?? '—'}
          {campaign.external_project_reference && <> · Salesforce: <span dir="ltr">{campaign.external_project_reference}</span></>}
          {campaign.brief_label && <> · בריף: {campaign.brief_label}</>}
          {!manage && <> · <strong>צפייה ותפעול (צוות)</strong></>}
        </p>
      </div>
      <Tabs tabs={visibleTabs.map((t) => ({ key: t.key, label: t.label }))} current={tab} basePath={`/campaigns/${params.id}`} />
      {body}
    </div>
  )
}
