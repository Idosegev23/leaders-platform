import { listStaff } from '@/lib/campaigns/services/campaigns'
import { canCreateCampaigns, orgHasHub } from '@/lib/campaigns/auth/policy'
import { NewCampaignForm } from '@/components/campaigns/new-campaign-form'
import { pageCtx, PermissionDenied } from '../_server'

export const dynamic = 'force-dynamic'

export default async function NewCampaignPage() {
  const ctx = await pageCtx()
  if (!canCreateCampaigns(ctx.actor)) return <PermissionDenied message="פתיחת קמפיין שמורה למנהלות קמפיין ולמנהלי מערכת." />
  const staff = (await listStaff(ctx)).filter((s) => s.role === 'admin' || s.role === 'manager')
  const hub = await orgHasHub(ctx.db, ctx.actor.orgId)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">פתיחת קמפיין</h1>
      <NewCampaignForm managers={staff} me={ctx.actor.userId} hub={hub} />
    </div>
  )
}
