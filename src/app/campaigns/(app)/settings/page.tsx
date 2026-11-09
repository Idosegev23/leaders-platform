import { getOrganization, listMembers } from '@/lib/campaigns/services/admin'
import { OrgSettings } from '@/components/campaigns/org-settings'
import { pageCtx, PermissionDenied } from '../_server'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const ctx = await pageCtx()
  if (ctx.actor.role !== 'admin') return <PermissionDenied message="הגדרות הארגון שמורות למנהלי הארגון." />
  const [org, members] = await Promise.all([getOrganization(ctx), listMembers(ctx)])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הגדרות הארגון</h1>
      <OrgSettings org={JSON.parse(JSON.stringify(org))} members={JSON.parse(JSON.stringify(members))} me={ctx.actor.userId} />
    </div>
  )
}
