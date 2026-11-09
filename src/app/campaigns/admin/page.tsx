import { listModuleUsers } from '@/lib/campaigns/services/admin'
import { RolesTable } from '@/components/campaigns/roles-table'
import { pageCtx, PermissionDenied } from '../_server'
import { PRODUCT } from '@/lib/campaigns/brand'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const ctx = await pageCtx()
  if (ctx.actor.role !== 'admin') return <PermissionDenied message="ניהול הרשאות המודול שמור למנהלי מערכת." />
  const users = await listModuleUsers(ctx)
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">הרשאות {PRODUCT.name}</h1>
      <p className="text-sm text-wizard-text-secondary">מנהלת קמפיין: פותחת ומנהלת קמפיינים שהוקצו לה. צוות: צפייה ותפעול בקמפיינים שצורף אליהם. מנהל מערכת: הכול, כולל הרשאות. משתמשים ללא תפקיד אינם רואים את המודול.</p>
      <RolesTable users={users} me={ctx.actor.userId} />
    </div>
  )
}
