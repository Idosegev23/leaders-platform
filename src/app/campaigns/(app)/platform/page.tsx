import { getPool } from '@/lib/campaigns/db'
import { listOrganizations } from '@/lib/campaigns/services/admin'
import { currentStaff } from '@/lib/campaigns/runtime'
import { PlatformOrgs } from '@/components/campaigns/platform-orgs'
import { PRODUCT } from '@/lib/campaigns/brand'
import { PermissionDenied } from '../_server'

export const dynamic = 'force-dynamic'

/** Platform admins only: the organizations (agencies) using Brieflow. No campaign data is shown here. */
export default async function PlatformPage() {
  const s = await currentStaff()
  if (!s.account || !s.platformAdmin) return <PermissionDenied message={`ניהול הארגונים שמור למנהלי ${PRODUCT.name}.`} />
  const orgs = await listOrganizations(getPool(), s.account)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ארגונים ב-{PRODUCT.name}</h1>
      <PlatformOrgs orgs={JSON.parse(JSON.stringify(orgs))} />
    </div>
  )
}
